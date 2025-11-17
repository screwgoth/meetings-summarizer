from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, Session
import boto3
import json
import re
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

# Database configuration
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "sqlite:///./meetings.db"
)

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, index=True, nullable=False)
    email = Column(String(255), nullable=True)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    must_change_password = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    token_version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    sessions = relationship(
        "MeetingSessionDB",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class MeetingSessionDB(Base):
    __tablename__ = "meeting_sessions"

    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    filename = Column(String(255), nullable=False)
    upload_date = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False, default="uploading")
    transcription = Column(Text, nullable=True)
    original_transcription = Column(Text, nullable=True)  # Store original before mappings
    summary = Column(Text, nullable=True)
    action_items = Column(Text, nullable=True)
    duration = Column(String(64), nullable=True)
    job_name = Column(String(255), nullable=True)
    error = Column(Text, nullable=True)
    speaker_mappings = Column(Text, nullable=True)  # JSON string: {"spk_0": "John", "spk_1": "Jane"}

    user = relationship("User", back_populates="sessions")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create tables and ensure default admin user exists."""
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@example.com",
                full_name="Administrator",
                hashed_password=pwd_context.hash("m33t!ng5"),
                must_change_password=False,
                is_admin=True,
                token_version=1,
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    init_db()

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
    
    # Check if all clients are initialized, if not, reinitialize
    if not all([s3_client, transcribe_client, bedrock_client]):
        # Reset all clients to ensure clean initialization
        s3_client = None
        transcribe_client = None
        bedrock_client = None
        
        try:
            # Get region from environment
            region = os.environ.get('AWS_REGION', 'us-east-1')
            # Verify credentials are set
            access_key = os.environ.get('AWS_ACCESS_KEY_ID')
            secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
            
            if not access_key or not secret_key:
                raise ValueError("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set")
            
            print(f"🔧 Initializing AWS clients for region: {region}")
            # Create clients with explicit region and credentials from environment
            print("  Creating S3 client...")
            s3_client = boto3.client('s3', region_name=region)
            print("  ✅ S3 client created")
            
            print("  Creating Transcribe client...")
            transcribe_client = boto3.client('transcribe', region_name=region)
            if transcribe_client is None:
                raise RuntimeError("Failed to create Transcribe client")
            print("  ✅ Transcribe client created")
            
            print("  Creating Bedrock client...")
            bedrock_client = boto3.client('bedrock-runtime', region_name=region)
            if bedrock_client is None:
                raise RuntimeError("Failed to create Bedrock client")
            print("  ✅ Bedrock client created")
            
            # Final verification
            if not all([s3_client, transcribe_client, bedrock_client]):
                raise RuntimeError(f"Client initialization incomplete: S3={s3_client is not None}, Transcribe={transcribe_client is not None}, Bedrock={bedrock_client is not None}")
            
            print(f"✅ All AWS clients initialized successfully for region: {region}")
            import sys
            sys.stdout.flush()
        except Exception as e:
            # Reset clients on failure to allow retry
            s3_client = None
            transcribe_client = None
            bedrock_client = None
            print(f"❌ Failed to initialize AWS clients: {str(e)}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"AWS credentials not configured: {str(e)}")
    
    return s3_client, transcribe_client, bedrock_client

# Pydantic Models
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
    error: Optional[str] = None

class CreateSessionRequest(BaseModel):
    title: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    requires_password_change: bool
    is_admin: bool


class UserProfile(BaseModel):
    username: str
    email: Optional[str]
    full_name: Optional[str]
    is_admin: bool
    must_change_password: bool


class UpdateProfileRequest(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class SpeakerRenameRequest(BaseModel):
    mapping: dict[str, str]


class SpeakerLabelsResponse(BaseModel):
    labels: list[str]
    current_mappings: dict[str, str]


class CreateUserRequest(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    full_name: Optional[str] = None
    is_admin: bool = False


class UserSummary(BaseModel):
    username: str
    email: Optional[str]
    full_name: Optional[str]
    is_admin: bool
    must_change_password: bool

# Authentication functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        token_version = payload.get("ver")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        user = db.query(User).filter(User.username == username).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if token_version is None or token_version != user.token_version:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return username
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return user


def require_admin(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return username

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


def _extract_speaker_labels(transcription: Optional[str]) -> list[str]:
    """Extract unique speaker labels from transcription text."""
    if not transcription:
        return []
    # Match patterns like "spk_0:", "spk_1:", "Speaker 0:", etc.
    patterns = [
        r'spk_\d+:',  # spk_0:, spk_1:, etc.
        r'Speaker \d+:',  # Speaker 0:, Speaker 1:, etc.
    ]
    labels = set()
    for pattern in patterns:
        matches = re.findall(pattern, transcription, re.IGNORECASE)
        labels.update(matches)
    # Remove the colon and return sorted list
    return sorted([label.rstrip(':') for label in labels])


def _apply_speaker_mapping(text: Optional[str], mapping: dict[str, str]) -> Optional[str]:
    """Replace speaker labels/names in arbitrary text fields."""
    if text is None:
        return None
    updated = text
    for label, name in mapping.items():
        clean_name = name.strip()
        if not clean_name:
            continue
        # Replace patterns like "spk_0:" or "Speaker 0:" first
        updated = updated.replace(f"{label}:", f"{clean_name}:")
        # Fallback replacement of bare labels, to also catch mentions in summary/action items
        updated = updated.replace(label, clean_name)
    return updated

# API Endpoints
@app.post("/api/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token"""
    user = db.query(User).filter(User.username == request.username).first()
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    access_token = create_access_token(data={"sub": request.username, "ver": user.token_version})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "requires_password_change": user.must_change_password,
        "is_admin": user.is_admin,
    }


@app.get("/api/users/me", response_model=UserProfile)
async def get_profile(user=Depends(get_current_user)):
    """Get the current user's profile"""
    return {
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "must_change_password": user.must_change_password,
    }


@app.put("/api/users/me", response_model=UserProfile)
async def update_profile(
    request: UpdateProfileRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's profile"""
    if request.email is not None:
        user.email = request.email.strip() or None
    if request.full_name is not None:
        user.full_name = request.full_name.strip() or None

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "must_change_password": user.must_change_password,
    }


@app.post("/api/users/me/change-password")
async def change_password(
    request: ChangePasswordRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password and invalidate existing tokens"""
    if not verify_password(request.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if request.current_password == request.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")
    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long")

    user.hashed_password = pwd_context.hash(request.new_password)
    user.must_change_password = False
    user.token_version += 1

    db.add(user)
    db.commit()

    return {"message": "Password updated. Please log in again.", "requires_logout": True}


@app.get("/api/admin/users", response_model=List[UserSummary])
async def list_users(
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all users (admin only)"""
    users = db.query(User).order_by(User.username.asc()).all()
    return [
        UserSummary(
            username=u.username,
            email=u.email,
            full_name=u.full_name,
            is_admin=u.is_admin,
            must_change_password=u.must_change_password,
        )
        for u in users
    ]


@app.post("/api/admin/users", response_model=UserSummary, status_code=status.HTTP_201_CREATED)
async def create_user(
    request: CreateUserRequest,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new user (admin only)"""
    existing = db.query(User).filter(User.username == request.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")

    new_user = User(
        username=request.username,
        email=request.email,
        full_name=request.full_name,
        hashed_password=pwd_context.hash(request.password),
        must_change_password=True,
        is_admin=request.is_admin,
        token_version=1,
    )
    db.add(new_user)
    db.commit()

    return UserSummary(
        username=request.username,
        email=request.email,
        full_name=request.full_name,
        is_admin=request.is_admin,
        must_change_password=True,
    )

@app.get("/api/sessions", response_model=List[MeetingSession])
async def get_sessions(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Get all meeting sessions for the authenticated user"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    sessions = (
        db.query(MeetingSessionDB)
        .filter(MeetingSessionDB.user_id == user.id)
        .order_by(MeetingSessionDB.upload_date.desc())
        .all()
    )
    return [
        MeetingSession(
            id=s.id,
            title=s.title,
            filename=s.filename,
            upload_date=s.upload_date,
            status=s.status,
            transcription=s.transcription,
            summary=s.summary,
            action_items=s.action_items,
            duration=s.duration,
            error=s.error,
        )
        for s in sessions
    ]

@app.post("/api/sessions", response_model=MeetingSession)
async def create_session(
    title: str = Form(...),
    file: UploadFile = File(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create a new meeting session and start processing"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Validate filename
    if not file.filename or not file.filename.strip():
        raise HTTPException(status_code=400, detail="File must have a filename")

    # Create session
    session_id = str(uuid.uuid4())
    upload_date = datetime.now().isoformat()

    db_session_obj = MeetingSessionDB(
        id=session_id,
        user_id=user.id,
        title=title,
        filename=file.filename,
        upload_date=upload_date,
        status="uploading",
    )
    db.add(db_session_obj)
    db.commit()
    db.refresh(db_session_obj)
    
    # Process file asynchronously (in production, use background tasks)
    try:
        # Upload to S3
        file_content = await file.read()
        # Extract file extension safely
        if '.' in file.filename:
            file_extension = file.filename.split('.')[-1].lower()
        else:
            file_extension = 'mp3'  # Default extension
        media_format = file_extension if file_extension in ['mp3', 'mp4', 'wav', 'flac', 'ogg', 'm4a'] else 'mp3'
        
        file_uri, file_key = upload_to_s3(file_content, file.filename, S3_BUCKET)
        
        # Update status
        db_session_obj.status = "transcribing"
        
        # Start transcription
        job_name = f"meeting_{session_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        start_transcription_job(file_uri, job_name, media_format)
        db_session_obj.job_name = job_name
        
    except HTTPException as e:
        # HTTPException has detail in e.detail
        db_session_obj.status = "error"
        db_session_obj.error = e.detail if hasattr(e, 'detail') else str(e)
        print(f"❌ Upload error (HTTPException): {db_session_obj.error}")
    except Exception as e:
        # Regular exceptions
        db_session_obj.status = "error"
        error_msg = str(e) if str(e) else f"Unknown error: {type(e).__name__}"
        db_session_obj.error = error_msg
        print(f"❌ Upload error: {error_msg}")
        import traceback
        traceback.print_exc()
    finally:
        db.add(db_session_obj)
        db.commit()
        db.refresh(db_session_obj)

    return MeetingSession(
        id=db_session_obj.id,
        title=db_session_obj.title,
        filename=db_session_obj.filename,
        upload_date=db_session_obj.upload_date,
        status=db_session_obj.status,
        transcription=db_session_obj.transcription,
        summary=db_session_obj.summary,
        action_items=db_session_obj.action_items,
        duration=db_session_obj.duration,
        error=db_session_obj.error,
    )

@app.get("/api/sessions/{session_id}", response_model=MeetingSession)
async def get_session(
    session_id: str,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Get a specific meeting session"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    db_session_obj = (
        db.query(MeetingSessionDB)
        .filter(MeetingSessionDB.id == session_id, MeetingSessionDB.user_id == user.id)
        .first()
    )

    if not db_session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    # Load and apply speaker mappings if they exist
    # Use original transcription if available, otherwise use current
    source_transcription = db_session_obj.original_transcription or db_session_obj.transcription
    transcription = source_transcription
    summary = db_session_obj.summary
    action_items = db_session_obj.action_items
    
    if db_session_obj.speaker_mappings:
        try:
            mapping = json.loads(db_session_obj.speaker_mappings)
            transcription = _apply_speaker_mapping(source_transcription, mapping)
            summary = _apply_speaker_mapping(summary, mapping)
            action_items = _apply_speaker_mapping(action_items, mapping)
        except json.JSONDecodeError:
            pass  # Invalid JSON, ignore

    return MeetingSession(
        id=db_session_obj.id,
        title=db_session_obj.title,
        filename=db_session_obj.filename,
        upload_date=db_session_obj.upload_date,
        status=db_session_obj.status,
        transcription=transcription,
        summary=summary,
        action_items=action_items,
        duration=db_session_obj.duration,
        error=db_session_obj.error,
    )

@app.post("/api/sessions/{session_id}/process", response_model=MeetingSession)
async def process_session(
    session_id: str,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Check and process transcription for a session"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    db_session_obj = (
        db.query(MeetingSessionDB)
        .filter(MeetingSessionDB.id == session_id, MeetingSessionDB.user_id == user.id)
        .first()
    )

    if not db_session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    print(f"🔍 Processing session {session_id}, current status: {db_session_obj.status}")

    if db_session_obj.status == "transcribing":
        print(f"📞 Checking transcription status for job: {db_session_obj.job_name}")
        # Check transcription status
        job = check_transcription_status(db_session_obj.job_name)

        if job:
            status_value = job["TranscriptionJobStatus"]
            print(f"✅ AWS Transcribe job status: {status_value}")

            if status_value == "COMPLETED":
                # Get transcription
                transcript_uri = job["Transcript"]["TranscriptFileUri"]
                transcript_data = get_transcription_result(transcript_uri)
                formatted_transcript, raw_transcript = format_transcript_with_speakers(
                    transcript_data
                )

                db_session_obj.transcription = formatted_transcript
                db_session_obj.original_transcription = formatted_transcript  # Store original
                db_session_obj.status = "analyzing"
                print(
                    f"📝 Transcription complete, status changed to: {db_session_obj.status}"
                )

                # Generate summary and action items
                db_session_obj.summary = generate_summary(raw_transcript)
                db_session_obj.action_items = extract_action_items(raw_transcript)
                db_session_obj.status = "completed"
                print(f"🎉 Analysis complete, final status: {db_session_obj.status}")

            elif status_value == "FAILED":
                db_session_obj.status = "error"
                db_session_obj.error = job.get("FailureReason", "Unknown error")
                print(f"❌ Transcription failed: {db_session_obj.error}")
        else:
            # AWS not configured - mark as error
            print("⚠️ AWS credentials not configured, marking as error")
            db_session_obj.status = "error"
            db_session_obj.error = (
                "AWS credentials not configured. Cannot process transcription."
            )
    else:
        print(f"⏭️ Skipping processing, status is: {db_session_obj.status}")

    db.add(db_session_obj)
    db.commit()
    db.refresh(db_session_obj)

    print(f"📤 Returning session with status: {db_session_obj.status}")
    return MeetingSession(
        id=db_session_obj.id,
        title=db_session_obj.title,
        filename=db_session_obj.filename,
        upload_date=db_session_obj.upload_date,
        status=db_session_obj.status,
        transcription=db_session_obj.transcription,
        summary=db_session_obj.summary,
        action_items=db_session_obj.action_items,
        duration=db_session_obj.duration,
        error=db_session_obj.error,
    )


@app.get("/api/sessions/{session_id}/speakers", response_model=SpeakerLabelsResponse)
async def get_speaker_labels(
    session_id: str,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Get available speaker labels and current mappings for a session"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    db_session_obj = (
        db.query(MeetingSessionDB)
        .filter(MeetingSessionDB.id == session_id, MeetingSessionDB.user_id == user.id)
        .first()
    )

    if not db_session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    # Extract speaker labels from original transcription (before any mappings)
    source_text = db_session_obj.original_transcription or db_session_obj.transcription
    labels = _extract_speaker_labels(source_text)
    
    # Load current mappings
    current_mappings = {}
    if db_session_obj.speaker_mappings:
        try:
            current_mappings = json.loads(db_session_obj.speaker_mappings)
        except json.JSONDecodeError:
            pass

    return SpeakerLabelsResponse(labels=labels, current_mappings=current_mappings)


@app.patch("/api/sessions/{session_id}/speakers", response_model=MeetingSession)
async def rename_speakers(
    session_id: str,
    request: SpeakerRenameRequest,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Rename speakers within a session's transcription, summary, and action items.

    This can be called immediately after transcription or at any time later.
    """
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    db_session_obj = (
        db.query(MeetingSessionDB)
        .filter(MeetingSessionDB.id == session_id, MeetingSessionDB.user_id == user.id)
        .first()
    )

    if not db_session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    mapping = request.mapping or {}
    
    # Save the mapping to database
    db_session_obj.speaker_mappings = json.dumps(mapping)
    
    # Get original transcription (before any mappings)
    original_transcription = db_session_obj.original_transcription or db_session_obj.transcription
    if not db_session_obj.original_transcription:
        # First time mapping - store original
        db_session_obj.original_transcription = db_session_obj.transcription
    
    # Apply mapping to original transcription, summary, and action items
    db_session_obj.transcription = _apply_speaker_mapping(
        original_transcription, mapping
    )
    db_session_obj.summary = _apply_speaker_mapping(db_session_obj.summary, mapping)
    db_session_obj.action_items = _apply_speaker_mapping(
        db_session_obj.action_items, mapping
    )

    db.add(db_session_obj)
    db.commit()
    db.refresh(db_session_obj)

    return MeetingSession(
        id=db_session_obj.id,
        title=db_session_obj.title,
        filename=db_session_obj.filename,
        upload_date=db_session_obj.upload_date,
        status=db_session_obj.status,
        transcription=db_session_obj.transcription,
        summary=db_session_obj.summary,
        action_items=db_session_obj.action_items,
        duration=db_session_obj.duration,
        error=db_session_obj.error,
    )

@app.delete("/api/sessions/{session_id}")
async def delete_session(
    session_id: str,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Delete a meeting session"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    db_session_obj = (
        db.query(MeetingSessionDB)
        .filter(MeetingSessionDB.id == session_id, MeetingSessionDB.user_id == user.id)
        .first()
    )

    if not db_session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    db.delete(db_session_obj)
    db.commit()

    return {"message": "Session deleted successfully"}

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)