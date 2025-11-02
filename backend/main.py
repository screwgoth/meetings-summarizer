from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import boto3
import json
import time
from datetime import datetime, timedelta
import os
import urllib.request
from jose import jwt
from passlib.context import CryptContext
import uuid

app = FastAPI(title="Meeting Transcription API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# AWS Configuration
S3_BUCKET = os.environ.get('S3_BUCKET_NAME', 'your-meeting-recordings-bucket')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Initialize AWS clients lazily to avoid startup errors
s3_client = None
transcribe_client = None
bedrock_client = None

def get_aws_clients():
    """Get AWS clients, initializing them if needed"""
    global s3_client, transcribe_client, bedrock_client
    if s3_client is None:
        try:
            s3_client = boto3.client('s3')
            transcribe_client = boto3.client('transcribe')
            bedrock_client = boto3.client('bedrock-runtime')
        except Exception:
            pass  # AWS credentials not configured
    return s3_client, transcribe_client, bedrock_client

# In-memory storage (replace with database in production)
users_db = {
    "admin": {
        "username": "admin",
        "hashed_password": pwd_context.hash("m33t!ng5"),
        "sessions": []
    }
}

# Models
class LoginRequest(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class MeetingSession(BaseModel):
    id: str
    title: str
    filename: str
    upload_date: str
    status: str
    transcription: Optional[str] = None
    summary: Optional[str] = None
    action_items: Optional[str] = None
    duration: Optional[str] = None

class CreateSessionRequest(BaseModel):
    title: str

# Authentication functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None or username not in users_db:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return username
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# AWS helper functions
def upload_to_s3(file_content, filename, bucket_name):
    """Upload file to S3 bucket"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    file_key = f"meetings/{timestamp}_{filename}"
    
    try:
        s3_client, _, _ = get_aws_clients()
        if s3_client is None:
            raise HTTPException(status_code=500, detail="AWS credentials not configured")
        s3_client.put_object(Bucket=bucket_name, Key=file_key, Body=file_content)
        file_uri = f"s3://{bucket_name}/{file_key}"
        return file_uri, file_key
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 upload error: {str(e)}")

def start_transcription_job(file_uri, job_name, media_format):
    """Start AWS Transcribe job with speaker identification"""
    try:
        _, transcribe_client, _ = get_aws_clients()
        if transcribe_client is None:
            raise HTTPException(status_code=500, detail="AWS credentials not configured")
        transcribe_client.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={'MediaFileUri': file_uri},
            MediaFormat=media_format,
            LanguageCode='en-US',
            Settings={
                'ShowSpeakerLabels': True,
                'MaxSpeakerLabels': 10
            }
        )
        return True
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")

def check_transcription_status(job_name):
    """Check the status of transcription job"""
    try:
        _, transcribe_client, _ = get_aws_clients()
        if transcribe_client is None:
            return None
        response = transcribe_client.get_transcription_job(
            TranscriptionJobName=job_name
        )
        return response['TranscriptionJob']
    except Exception as e:
        return None

def get_transcription_result(transcript_uri):
    """Retrieve transcription result"""
    try:
        if transcript_uri.startswith("s3://"):
            s3_client, _, _ = get_aws_clients()
            if s3_client is None:
                raise HTTPException(status_code=500, detail="AWS credentials not configured")
            parts = transcript_uri.replace("s3://", "").split("/", 1)
            bucket = parts[0]
            key = parts[1]
            response = s3_client.get_object(Bucket=bucket, Key=key)
            transcript_data = json.loads(response['Body'].read().decode('utf-8'))
            return transcript_data
        else:
            with urllib.request.urlopen(transcript_uri) as resp:
                content_bytes = resp.read()
                content_text = content_bytes.decode('utf-8')
                transcript_data = json.loads(content_text)
                return transcript_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving transcription: {str(e)}")

def format_transcript_with_speakers(transcript_data):
    """Format transcript with speaker labels"""
    try:
        transcript_text = transcript_data['results']['transcripts'][0]['transcript']
        items = transcript_data['results']['items']
        speaker_segments = transcript_data['results']['speaker_labels']['segments']
        
        formatted_transcript = []
        current_speaker = None
        current_text = []
        
        for segment in speaker_segments:
            speaker = segment['speaker_label']
            segment_items = segment['items']
            
            segment_text = []
            for item in segment_items:
                start_time = float(item['start_time'])
                
                for word_item in items:
                    if word_item['type'] == 'pronunciation':
                        if 'start_time' in word_item and abs(float(word_item['start_time']) - start_time) < 0.01:
                            segment_text.append(word_item['alternatives'][0]['content'])
                        
            text = ' '.join(segment_text)
            
            if speaker != current_speaker:
                if current_text:
                    formatted_transcript.append(f"\n{current_speaker}: {' '.join(current_text)}\n")
                current_speaker = speaker
                current_text = [text]
            else:
                current_text.append(text)
        
        if current_text:
            formatted_transcript.append(f"\n{current_speaker}: {' '.join(current_text)}\n")
        
        return ''.join(formatted_transcript), transcript_text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error formatting transcript: {str(e)}")

def invoke_claude(prompt, max_tokens=4000):
    """Invoke Claude via AWS Bedrock"""
    try:
        _, _, bedrock_client = get_aws_clients()
        if bedrock_client is None:
            raise HTTPException(status_code=500, detail="AWS credentials not configured")
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": prompt}]
                }
            ]
        }
        
        response = bedrock_client.invoke_model(
            modelId='us.anthropic.claude-3-5-sonnet-20241022-v2:0',
            accept='application/json',
            contentType='application/json',
            body=json.dumps(request_body)
        )
        
        response_body = json.loads(response['body'].read())
        text_blocks = [c.get('text', '') for c in response_body.get('content', []) if c.get('type') == 'text']
        return "".join(text_blocks)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Claude error: {str(e)}")

def generate_summary(transcript):
    """Generate meeting summary using Claude"""
    prompt = f"""Based on the following meeting transcript, provide a concise summary of the key discussion points, decisions made, and overall context of the meeting.

Transcript:
{transcript}

Please provide a clear, well-structured summary."""
    
    return invoke_claude(prompt)

def extract_action_items(transcript):
    """Extract action items using Claude"""
    prompt = f"""Based on the following meeting transcript, extract all action items, tasks, and follow-ups that were mentioned or assigned.

Transcript:
{transcript}

Please list all action items in a clear, bullet-point format. Include who is responsible if mentioned, and any deadlines if specified."""
    
    return invoke_claude(prompt)

# API Endpoints
@app.post("/api/auth/login", response_model=Token)
async def login(request: LoginRequest):
    """Authenticate user and return JWT token"""
    user = users_db.get(request.username)
    if not user or not verify_password(request.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    access_token = create_access_token(data={"sub": request.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/sessions", response_model=List[MeetingSession])
async def get_sessions(username: str = Depends(verify_token)):
    """Get all meeting sessions for the authenticated user"""
    user = users_db[username]
    return user["sessions"]

@app.post("/api/sessions", response_model=MeetingSession)
async def create_session(
    title: str,
    file: UploadFile = File(...),
    username: str = Depends(verify_token)
):
    """Create a new meeting session and start processing"""
    user = users_db[username]
    
    # Create session
    session_id = str(uuid.uuid4())
    session = {
        "id": session_id,
        "title": title,
        "filename": file.filename,
        "upload_date": datetime.now().isoformat(),
        "status": "uploading",
        "transcription": None,
        "summary": None,
        "action_items": None,
        "duration": None
    }
    
    user["sessions"].insert(0, session)
    
    # Process file asynchronously (in production, use background tasks)
    try:
        # Upload to S3
        file_content = await file.read()
        file_extension = file.filename.split('.')[-1].lower()
        media_format = file_extension if file_extension in ['mp3', 'mp4', 'wav', 'flac', 'ogg'] else 'mp3'
        
        file_uri, file_key = upload_to_s3(file_content, file.filename, S3_BUCKET)
        
        # Update status
        session["status"] = "transcribing"
        
        # Start transcription
        job_name = f"meeting_{session_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        start_transcription_job(file_uri, job_name, media_format)
        session["job_name"] = job_name
        
    except Exception as e:
        session["status"] = "error"
        session["error"] = str(e)
    
    return session

@app.get("/api/sessions/{session_id}", response_model=MeetingSession)
async def get_session(session_id: str, username: str = Depends(verify_token)):
    """Get a specific meeting session"""
    user = users_db[username]
    session = next((s for s in user["sessions"] if s["id"] == session_id), None)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return session

@app.post("/api/sessions/{session_id}/process")
async def process_session(session_id: str, username: str = Depends(verify_token)):
    """Check and process transcription for a session"""
    user = users_db[username]
    session = next((s for s in user["sessions"] if s["id"] == session_id), None)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    print(f"🔍 Processing session {session_id}, current status: {session['status']}")
    
    if session["status"] == "transcribing":
        print(f"📞 Checking transcription status for job: {session.get('job_name')}")
        # Check transcription status
        job = check_transcription_status(session.get("job_name"))
        
        if job:
            status_value = job['TranscriptionJobStatus']
            print(f"✅ AWS Transcribe job status: {status_value}")
            
            if status_value == 'COMPLETED':
                # Get transcription
                transcript_uri = job['Transcript']['TranscriptFileUri']
                transcript_data = get_transcription_result(transcript_uri)
                formatted_transcript, raw_transcript = format_transcript_with_speakers(transcript_data)
                
                session["transcription"] = formatted_transcript
                session["status"] = "analyzing"
                print(f"📝 Transcription complete, status changed to: {session['status']}")
                
                # Generate summary and action items
                session["summary"] = generate_summary(raw_transcript)
                session["action_items"] = extract_action_items(raw_transcript)
                session["status"] = "completed"
                print(f"🎉 Analysis complete, final status: {session['status']}")
                
            elif status_value == 'FAILED':
                session["status"] = "error"
                session["error"] = job.get('FailureReason', 'Unknown error')
                print(f"❌ Transcription failed: {session['error']}")
        else:
            # AWS not configured - mark as error
            print(f"⚠️ AWS credentials not configured, marking as error")
            session["status"] = "error"
            session["error"] = "AWS credentials not configured. Cannot process transcription."
    else:
        print(f"⏭️ Skipping processing, status is: {session['status']}")
    
    print(f"📤 Returning session with status: {session['status']}")
    return session

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, username: str = Depends(verify_token)):
    """Delete a meeting session"""
    user = users_db[username]
    session = next((s for s in user["sessions"] if s["id"] == session_id), None)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    user["sessions"] = [s for s in user["sessions"] if s["id"] != session_id]
    
    return {"message": "Session deleted successfully"}

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)