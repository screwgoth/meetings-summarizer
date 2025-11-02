# Meeting Transcription Full-Stack Application

A complete web application for transcribing, summarizing, and extracting action items from meeting recordings using AWS services (Transcribe, Bedrock, S3) with FastAPI backend and Next.js frontend.

## 🏗️ Architecture

```
┌─────────────────┐      ┌──────────────┐      ┌─────────────────┐
│   Next.js UI    │─────▶│ FastAPI      │─────▶│  AWS Services   │
│   (Frontend)    │      │  (Backend)   │      │ - S3            │
│   Port 3000     │      │  Port 8000   │      │ - Transcribe    │
│                 │◀─────│              │◀─────│ - Bedrock       │
└─────────────────┘      └──────────────┘      └─────────────────┘
```

## 📋 Prerequisites

- Python 3.8+
- Node.js 18+
- AWS Account with:
  - S3 bucket created
  - Transcribe service enabled
  - Bedrock access with Claude models enabled
  - IAM credentials configured

## 🚀 Quick Start

### 1. Backend Setup (FastAPI)

```bash
# Create project directory
mkdir meeting-transcription-app
cd meeting-transcription-app

# Create backend directory
mkdir backend
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Create requirements.txt
cat > requirements.txt << EOF
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6
boto3==1.29.7
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
pydantic==2.5.0
EOF

# Install dependencies
pip install -r requirements.txt

# Create main.py (copy the FastAPI backend code)
# Save the backend code as main.py

# Set environment variables
export S3_BUCKET_NAME=your-meeting-recordings-bucket
export AWS_REGION=us-east-1
export JWT_SECRET_KEY=your-secret-key-change-this

# Configure AWS credentials
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Enter your default region (e.g., us-east-1)

# Run the backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup (Next.js)

```bash
# In a new terminal, go back to project root
cd ..

# Create Next.js app
npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir
cd frontend

# Install additional dependencies
npm install axios date-fns

# Create directory structure
mkdir -p lib app/login app/dashboard app/session/[id]

# Copy the frontend code into respective files:
# - lib/api.ts
# - app/page.tsx
# - app/layout.tsx
# - app/globals.css
# - app/login/page.tsx
# - app/dashboard/page.tsx
# - app/session/[id]/page.tsx

# Create .env.local for environment variables
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF

# Run the frontend
npm run dev
```

### 3. AWS Configuration

#### Create S3 Bucket
```bash
aws s3 mb s3://your-meeting-recordings-bucket --region us-east-1
```

#### Enable Bedrock (Console)
1. Go to AWS Console → Bedrock
2. Request model access for Claude 3.5 Sonnet
3. Wait for approval (usually instant)

#### IAM Policy
Create an IAM user or role with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-meeting-recordings-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "transcribe:StartTranscriptionJob",
        "transcribe:GetTranscriptionJob",
        "transcribe:ListTranscriptionJobs"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "*"
    }
  ]
}
```

## 📦 Project Structure

```
meeting-transcription-app/
├── backend/
│   ├── main.py                 # FastAPI application
│   ├── requirements.txt        # Python dependencies
│   └── venv/                   # Virtual environment
│
└── frontend/
    ├── app/
    │   ├── page.tsx           # Root redirect
    │   ├── layout.tsx         # Root layout
    │   ├── globals.css        # Global styles
    │   ├── login/
    │   │   └── page.tsx       # Login page
    │   ├── dashboard/
    │   │   └── page.tsx       # Dashboard with session cards
    │   └── session/
    │       └── [id]/
    │           └── page.tsx   # Session detail view
    ├── lib/
    │   └── api.ts             # API client
    ├── package.json
    ├── tailwind.config.js
    └── tsconfig.json
```

## 🔐 Default Credentials

- **Username**: `admin`
- **Password**: `m33t!ng5`

## 🎯 Features

### Authentication
- JWT-based authentication
- Secure login with bcrypt password hashing
- Token stored in localStorage

### Meeting Management
- Upload audio files (MP3, WAV, MP4, M4A, FLAC, OGG)
- Create titled meeting sessions
- View all sessions as cards
- Delete unwanted sessions
- Session history persists

### AI Processing
- **Transcription**: AWS Transcribe with speaker identification
- **Summary**: AI-generated meeting summary using Claude
- **Action Items**: Extracted tasks and follow-ups

### UI/UX
- Modern, responsive design with Tailwind CSS
- Real-time status updates
- Progress indicators
- Download transcription, summary, and action items
- Session cards with status badges

## 🔧 Configuration

### Backend Environment Variables
```bash
S3_BUCKET_NAME=your-meeting-recordings-bucket
AWS_REGION=us-east-1
JWT_SECRET_KEY=your-super-secret-key-change-this
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

### Frontend Environment Variables
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 📝 API Endpoints

### Authentication
- `POST /api/auth/login` - Login and get JWT token

### Sessions
- `GET /api/sessions` - Get all sessions
- `GET /api/sessions/{id}` - Get specific session
- `POST /api/sessions` - Create new session
- `POST /api/sessions/{id}/process` - Check/process transcription
- `DELETE /api/sessions/{id}` - Delete session

### Health
- `GET /api/health` - Health check

## 🚦 Usage Flow

1. **Login** with credentials
2. **Click "New Meeting"** to upload a recording
3. **Enter title** and **select audio file**
4. **Wait for processing**:
   - Upload to S3 ✓
   - Transcribe with speaker labels ✓
   - Generate summary with Claude ✓
   - Extract action items ✓
5. **View results** in session detail page
6. **Download** transcription, summary, or action items
7. **Delete** unwanted sessions

## 🐛 Troubleshooting

### Backend Issues
```bash
# Check if backend is running
curl http://localhost:8000/api/health

# Check AWS credentials
aws sts get-caller-identity

# Check S3 bucket access
aws s3 ls s3://your-meeting-recordings-bucket
```

### Frontend Issues
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check environment variables
cat .env.local
```

### AWS Issues
- Ensure Bedrock model access is approved
- Check IAM permissions
- Verify S3 bucket exists in correct region
- Check CloudWatch logs for Transcribe errors

## 🔒 Security Notes

⚠️ **Important for Production:**

1. Change the default JWT secret key
2. Use environment variables for all secrets
3. Implement proper database instead of in-memory storage
4. Add rate limiting
5. Use HTTPS
6. Implement proper CORS policies
7. Add input validation and sanitization
8. Use secure password requirements
9. Implement user registration and password reset

## 📊 Monitoring

### Backend Logs
```bash
# View uvicorn logs
tail -f uvicorn.log
```

### AWS CloudWatch
- Monitor Transcribe job failures
- Check Bedrock invocation metrics
- Review S3 access logs

## 🎓 Development Tips

1. **Test locally first** before deploying
2. **Use small audio files** during development to save time
3. **Monitor AWS costs** - Transcribe and Bedrock can be expensive
4. **Keep sessions list refreshed** to see status updates
5. **Check browser console** for frontend errors
6. **Use background tasks** (Celery, etc.) for production processing

## 📦 Deployment

### Backend (FastAPI)
```bash
# Using Docker
docker build -t meeting-backend .
docker run -p 8000:8000 --env-file .env meeting-backend

# Using systemd service
sudo systemctl start meeting-backend
```

### Frontend (Next.js)
```bash
# Build for production
npm run build

# Start production server
npm start

# Or deploy to Vercel
vercel deploy
```

## 🤝 Contributing

This is a Phase 1 implementation. Future enhancements could include:
- User registration and management
- PostgreSQL database integration
- Real-time WebSocket updates
- Collaborative session sharing
- Email notifications
- Calendar integration
- Multiple language support
- Custom AI prompts

## 📄 License

MIT License - feel free to use and modify!

## 🆘 Support

For issues:
1. Check AWS service status
2. Verify credentials and permissions
3. Review backend logs
4. Check browser console
5. Test API endpoints with curl/Postman

---

**Happy Meeting Transcribing! 🎙️**
