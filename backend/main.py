import os
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException,Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel



from livekit import api
from livekit.api import TokenVerifier



load_dotenv()


LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")


if not LIVEKIT_URL:
    raise RuntimeError("LIVEKIT_URL is missing")

if not LIVEKIT_API_KEY:
    raise RuntimeError("LIVEKIT_API_KEY is missing")

if not LIVEKIT_API_SECRET:
    raise RuntimeError("LIVEKIT_API_SECRET is missing")


app = FastAPI(
    title="LiveKit Day 14-15"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class JoinRequest(BaseModel):
    room_name: str
    participant_identity: str | None = None


@app.get("/")
async def root():
    return {
        "message": "LiveKit backend is running"
    }


@app.post("/livekit/join")
async def join_room(data: JoinRequest):

    room_name = data.room_name.strip()

    if not room_name:
        raise HTTPException(
            status_code=400,
            detail="Room name is required"
        )


    identity = (
        data.participant_identity
        or f"user-{uuid.uuid4().hex[:8]}"
    )


    # LiveKit server API
    lkapi = api.LiveKitAPI(
        url=LIVEKIT_URL,
        api_key=LIVEKIT_API_KEY,
        api_secret=LIVEKIT_API_SECRET,
    )


    # Day 15 requirement:
    # Create room server-side.
    try:

        await lkapi.room.create_room(
            api.CreateRoomRequest(
                name=room_name,
                empty_timeout=600,
                max_participants=20,
            )
        )

    except Exception as error:

        # Room may already exist.
        print(
            f"Room creation note: {error}"
        )


    # Create scoped access token
    token = (
        api.AccessToken(
            LIVEKIT_API_KEY,
            LIVEKIT_API_SECRET,
        )
        .with_identity(identity)
        .with_name(identity)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )


    await lkapi.aclose()


    return {
        "server_url": LIVEKIT_URL,
        "room_name": room_name,
        "participant_identity": identity,
        "token": token,
    }

@app.post("/livekit/webhook")
async def livekit_webhook(request: Request):

    body = await request.body()

    auth_header = request.headers.get("Authorization")

    if not auth_header:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header",
        )

    try:
        verifier = TokenVerifier(
            LIVEKIT_API_KEY,
            LIVEKIT_API_SECRET,
        )

        receiver = api.WebhookReceiver(verifier)

        webhook_event = receiver.receive(
            body.decode("utf-8"),
            auth_header,
        )

    except Exception as error:
        print(f"Webhook verification failed: {error}")

        raise HTTPException(
            status_code=401,
            detail="Invalid webhook",
        )

    print("\n========== LIVEKIT WEBHOOK ==========")
    print(f"Event: {webhook_event.event}")

    if webhook_event.room:
        print(f"Room: {webhook_event.room.name}")

    if webhook_event.participant:
        print(
            f"Participant: "
            f"{webhook_event.participant.identity}"
        )

    print("=====================================\n")

    return {
        "received": True,
        "event": webhook_event.event,
    }
