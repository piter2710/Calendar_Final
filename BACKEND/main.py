import json
from typing import *
from sqlalchemy.exc import IntegrityError
from fastapi import FastAPI, HTTPException,Depends
from fastapi.middleware.cors import CORSMiddleware
import datetime
import os.path
from pydantic import BaseModel, ConfigDict, validator, ValidationError
from starlette.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import  Flow
from googleapiclient.discovery import build
from starlette.responses import RedirectResponse
from starlette.status import HTTP_401_UNAUTHORIZED, HTTP_204_NO_CONTENT, HTTP_200_OK, HTTP_500_INTERNAL_SERVER_ERROR, \
    HTTP_400_BAD_REQUEST, HTTP_403_FORBIDDEN, HTTP_404_NOT_FOUND
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer

SQLALCHEMY_DATABASE_URL = "postgresql://postgres:piter@postgres:5432/EventsHistoryDB"


engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
app = FastAPI()
origins = {
    "http://localhost:3000",
    "http://localhost:3000/admin",
"http://localhost:3000/",
}
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
client_secret_file = os.path.join(os.path.dirname(__file__), 'client_secret.json')
token_file = os.path.join(os.path.dirname(__file__), 'token.json')
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
SCOPES = ['https://www.googleapis.com/auth/calendar']
flow = Flow.from_client_secrets_file(
    client_secret_file, scopes=SCOPES,
    redirect_uri='http://localhost:8000/auth/callback'
)
#JWT
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30
ALGORITHM = "HS256"
JWT_SECRET_KEY = 'secret'
JWT_REFRESH_SECRET_KEY = 'secret'
password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True, unique=True)
    username = Column(String)
    password = Column(String)
class UserAuth(BaseModel):
    username: str
    password: str
class TokenSchema(BaseModel):
    access_token: str
    refresh_token: str
class TokenPayload(BaseModel):
    sub: str = None
    exp: int = None
class UserOut(BaseModel):
    id: int
    username: str
class SystemUser(UserOut):
    password: str
Base.metadata.create_all(bind=engine)
class AuthRequest(BaseModel):
    username: str
    password: str
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

db_dependency = Annotated[Session, Depends(get_db)]
reusable_oauth = OAuth2PasswordBearer(
    tokenUrl='/loginAdmin/',
    scheme_name="JWT"
)


def get_current_user(db: db_dependency, token: str = Depends(reusable_oauth)):
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        token_data = TokenPayload(**payload)
        if datetime.datetime.fromtimestamp(token_data.exp) < datetime.datetime.now():
            raise HTTPException(
                status_code=HTTP_401_UNAUTHORIZED,
                detail="Token expired",
                headers={"WWW-Authenticate": "Bearer"}
            )
    except(JWTError, ValidationError):
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
            )
    user: Union[dict[str, Any], None] = db.query(User).filter_by(username=token_data.sub).first()
    if user is None:
        raise HTTPException(
            status_code=HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return SystemUser
user_dependency =Annotated [SystemUser, Depends(get_current_user)]
class Event(Base):
    __tablename__ = 'events'
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String,nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    action = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now())
class EventCreate(BaseModel):
    title: str
    start: datetime.datetime
    end: datetime.datetime
    action: str
    class Config:
        arbitrary_types_allowed = True
class EventCountResponse(BaseModel):
    total_events: int
    added_events: int
    deleted_events: int
Base.metadata.create_all(bind=engine)
@app.on_event("startup")
async def startup_event():
    db: Session = next(get_db())
    with open(token_file, 'w') as tk:
        tk.write('')
    admin_username = "admin@admin.com"
    admin_password = "admin123"

    admin_user = db.query(User).filter_by(username=admin_username).first()
        
    if admin_user is None:
        try:
            new_user = User(
                username=admin_username,
                password=get_hashed_password(admin_password)  # Hash the password
            )
            db.add(new_user)
            db.commit()
            print("Admin user created successfully.")
        except IntegrityError:
            db.rollback()  # Rollback in case of integrity error
            print("An error occurred while creating the admin user.")
@app.get("/events", status_code=HTTP_200_OK)
async def read_events(db: db_dependency):
    return db.query(Event).order_by(Event.created_at).all()

@app.post("/event")
async def event_to_db(event: EventCreate, db: db_dependency):
    new_event = Event(
        title=event.title,
        start_date=event.start,
        end_date=event.end,
        action=event.action,
    )
    db.add(new_event)
    db.commit()
    return new_event
@app.get("/event/count", status_code=HTTP_200_OK, response_model=EventCountResponse)
async def read_event_count(db: db_dependency):
    total_events = db.query(Event).count()
    added_events = db.query(Event).filter(Event.action == "Created").count()
    deleted_events = db.query(Event).filter(Event.action == "DELETED").count()
    return EventCountResponse(
        total_events=total_events,
        added_events=added_events,
        deleted_events=deleted_events
    )
@app.get("/auth/login")
async def login():
    authorization_url, state = flow.authorization_url(prompt='consent')
    return RedirectResponse(url=authorization_url)
@app.get("/auth/callback")
async def callback(request: Request):
    flow.fetch_token(authorization_response=str(request.url))
    credentials = flow.credentials
    save_credentials(credentials)
    return RedirectResponse(url='http://localhost:3000/')
@app.get("/auth/check")
async def check():
    credentials = load_credentials()

    if credentials is None:
        return {"authenticated": False}

    if credentials and credentials.valid:
        return {"authenticated": True}

    return {"authenticated": False}
@app.get("/calendar/events")
async def get_events():
    credentials = load_credentials()
    if not credentials:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="No credentials found.")
    service = build('calendar', 'v3', credentials=credentials)
    now = datetime.datetime.utcnow().isoformat() + 'Z'
    events_result = (
        service.events()
        .list(
            calendarId='primary',
            timeMin=now,
            maxResults=10000,
            singleEvents=True,
            orderBy='startTime',
        )
        .execute()
    )
    events = events_result.get('items', [])
    if not events:
        raise HTTPException(status_code=HTTP_204_NO_CONTENT,detail="No events found.")
    return events
@app.get("/calendar/event/{event_id}")
async def get_event(event_id: str):
    credentials = load_credentials()
    if not credentials:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="No credentials found.")
    service = build('calendar', 'v3', credentials=credentials)
    event = service.events().get(calendarId='primary', eventId=event_id).execute()
    return event
@app.post("/auth/isAdmin/",status_code=HTTP_200_OK)
async def admin_check(db:db_dependency, auth_request: AuthRequest):
    user = db.query(User).filter(User.username == auth_request.username).first()
    if user and verify_password(auth_request.password, user.password):
        return {"is_admin": True}

    raise HTTPException(status_code=401, detail="Invalid credentials")
@app.post("/calendar/events/")
async def create_event(event: dict):
    credentials = load_credentials()

    service=build('calendar', 'v3', credentials=credentials)

    if not credentials:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="No credentials found.")
    event = {
        'summary': event['summary'],
        'start':{
            'dateTime':event['start'],
            'timeZone':'Europe/Warsaw',
        },
        'end':{
            'dateTime':event['end'],
            'timeZone':'Europe/Warsaw',
        }

    }
    created_event = service.events().insert(calendarId='primary', body=event).execute()
    return created_event


class EventUpdate(BaseModel):
    event_id: str
    summary: str
    start: dict
    end: dict

    class Config:
        arbitrary_types_allowed = True  # Allow arbitrary types if necessary

@app.put("/update_event/")
async def update_event(event_update: EventUpdate):
    creds = load_credentials()
    service = build('calendar', 'v3', credentials=creds)

    try:
        event = service.events().get(calendarId='primary', eventId=event_update.event_id).execute()
        event['summary'] = event_update.summary
        event['start'] = event_update.start
        event['end'] = event_update.end

        updated_event = service.events().update(calendarId='primary', eventId=event_update.event_id, body=event).execute()
        return {"status": "success", "event": updated_event}

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
@app.delete("/calendar/events/{event_id}", status_code=HTTP_200_OK)
async def delete_event(event_id: str):
    credentials = load_credentials()
    service=build('calendar', 'v3', credentials=credentials)
    if not credentials:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="No credentials found.")
    deleted_event = service.events().delete(calendarId='primary', eventId=event_id).execute()
    return {"detail": "Event deleted successfully"}



@app.post("/google_logout/")
async def google_logout():
    try:
        with open (token_file, 'w') as tk:
            tk.write('')
        return RedirectResponse(url="http://localhost:3000/")

    except Exception as e:
        raise HTTPException(status_code=HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
@app.delete("/calendar/events/", status_code=200)
async def delete_all_events():
    credentials = load_credentials()
    service = build('calendar', 'v3', credentials=credentials)

    if not credentials:
        raise HTTPException(status_code=401, detail="No credentials found.")

    # Fetch current events from the calendar
    events_result = service.events().list(calendarId='primary').execute()
    events = events_result.get('items', [])
    deleted_count = len(events)  # Count how many events are currently present

    # Clear all events
    service.calendars().clear(calendarId='primary').execute()

    return {"deleted_count": deleted_count}


@app.delete("/events/history/")
async def delete_all_events(db: db_dependency):
    deleted_count = db.query(Event).delete(synchronize_session=False)
    db.commit()
    return deleted_count


@app.delete("/events/history/{event_id}")
async def delete_event_history(event_id: int,db: db_dependency ):
    delete_history = db.query(Event).filter(Event.id == event_id).delete()
    db.commit()
    return delete_history


def credentials_to_dict(credentials):
    return {
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "token": credentials.token,
        "scopes": credentials.scopes,
    }
def save_credentials(credentials):
    with open(token_file, "w") as token:
        json.dump(credentials_to_dict(credentials), token)
def load_credentials():
    if os.path.exists(token_file):
        with open(token_file, "r") as token:
            try:
                credentials_dict = json.load(token)
                if credentials_dict and "token" in credentials_dict:  # Ensure token data exists
                    return Credentials(**credentials_dict)
                else:
                    print("Error: token.json is empty or incomplete.")
                    return None
            except json.JSONDecodeError:
                print("Error: token.json is invalid.")
                return None
    else:
        print("Error: token.json does not exist.")
    return None

def get_hashed_password(password):
    return password_context.hash(password)
def verify_password(password: str, hashed_password: str) -> bool:
    return password_context.verify(password, hashed_password)
def create_access_token(subject: Union[str, Any], expires_delta: int = None) -> str:
    if expires_delta is not None:
        expires_delta = datetime.datetime.utcnow() + expires_delta
    else:
        expires_delta = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expires_delta, "sub":str(subject)}
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(subject: Union[str, Any], expires_delta: int = None) -> str:
    if expires_delta is not None:
        expires_delta = datetime.datetime.utcnow()+ expires_delta
    else:
        expires_delta = datetime.datetime.utcnow()+ datetime.timedelta(minutes=REFRESH_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expires_delta, "sub":str(subject)}
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@app.post("/create_admin/", summary="Create admin user")
async def create_admin(data: UserAuth, db: db_dependency):
    user = db.query(User).filter_by(username=data.username).first()
    if user is not None:
        raise HTTPException(
            status_code=HTTP_400_BAD_REQUEST,
        detail="User with this name already exists")
    new_user = User(
        username=data.username,
        password=get_hashed_password(data.password)
        )
    db.add(new_user)
    db.commit()
    return {"detail":"Added new user"}
@app.post("/loginAdmin/", summary="Login admin")
async def loginAdmin( db: db_dependency, form_data: OAuth2PasswordRequestForm = Depends()):
    user = db.query(User).filter_by(username=form_data.username).first()
    if user is None:
        raise HTTPException(
            status_code=HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password"
        )
    hashed_pass = user.password
    if not verify_password(form_data.password, hashed_pass):
        raise HTTPException(
            status_code=HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password"
        )
    return {"access_token": create_access_token(user.username), "refresh_token": create_refresh_token(user.username), "token_type": "bearer", "is_admin":True}


@app.get("/test-endpoint/", summary="Test endpoint")
async def test_endpoint(current_user: user_dependency):
    return {"message": "HI"}
