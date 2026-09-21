const {
    Room,
    RoomEvent,
    Track
} = LivekitClient;

let room = null;

const BACKEND_URL = "http://127.0.0.1:8000";

const roomNameInput = document.getElementById("roomName");
const identityInput = document.getElementById("identity");
const joinBtn = document.getElementById("joinBtn");
const leaveBtn = document.getElementById("leaveBtn");
const status = document.getElementById("status");
const localVideo = document.getElementById("localVideo");
const remoteVideos = document.getElementById("remoteVideos");
const messages = document.getElementById("messages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");


function updateStatus(text, connected = false) {
    status.textContent = connected
        ? `🟢 ${text}`
        : `🔴 ${text}`;
}


function addMessage(sender, message) {
    const div = document.createElement("div");

    div.className = "message";

    div.textContent = `${sender}: ${message}`;

    messages.appendChild(div);

    messages.scrollTop = messages.scrollHeight;
}


function attachTrack(track, container) {
    const element = track.attach();

    element.classList.add("media");

    container.appendChild(element);

    return element;
}


async function joinRoom() {

    const roomName = roomNameInput.value.trim();

    const identity =
        identityInput.value.trim() ||
        `browser-${Math.random()
            .toString(36)
            .substring(2, 8)}`;

    if (!roomName) {
        alert("Please enter a room name.");
        return;
    }

    updateStatus("Getting access token...");

    try {

        const response = await fetch(
            `${BACKEND_URL}/livekit/join`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    room_name: roomName,
                    participant_identity: identity
                })
            }
        );


        if (!response.ok) {
            throw new Error(await response.text());
        }


        const data = await response.json();

        console.log("Token received");


        room = new Room({
            adaptiveStream: true,
            dynacast: true
        });


        room.on(
            RoomEvent.TrackSubscribed,
            (track, publication, participant) => {

                console.log(
                    "Remote track:",
                    participant.identity,
                    track.kind
                );

                if (
                    track.kind === Track.Kind.Video ||
                    track.kind === Track.Kind.Audio
                ) {

                    attachTrack(
                        track,
                        remoteVideos
                    );
                }
            }
        );


        room.on(
            RoomEvent.TrackUnsubscribed,
            (track) => {

                track
                    .detach()
                    .forEach(
                        element => element.remove()
                    );
            }
        );


        room.on(
            RoomEvent.ParticipantConnected,
            participant => {

                addMessage(
                    "SYSTEM",
                    `${participant.identity} joined the room`
                );
            }
        );


        room.on(
            RoomEvent.ParticipantDisconnected,
            participant => {

                addMessage(
                    "SYSTEM",
                    `${participant.identity} left the room`
                );
            }
        );


        room.on(
            RoomEvent.DataReceived,
            (payload, participant) => {

                try {

                    const text =
                        new TextDecoder().decode(payload);

                    const data =
                        JSON.parse(text);

                    addMessage(
                        data.sender ||
                        participant?.identity ||
                        "Participant",

                        data.message
                    );

                } catch (error) {

                    console.error(
                        "Data message error:",
                        error
                    );
                }
            }
        );


        await room.connect(
            data.server_url,
            data.token
        );


        await room.localParticipant
            .enableCameraAndMicrophone();


        for (
            const publication
            of room.localParticipant
                .trackPublications
                .values()
        ) {

            if (
                publication.track &&
                publication.kind === Track.Kind.Video
            ) {

                attachTrack(
                    publication.track,
                    localVideo
                );
            }
        }


        updateStatus(
            `Connected as ${identity}`,
            true
        );


        joinBtn.disabled = true;
        leaveBtn.disabled = false;


        addMessage(
            "SYSTEM",
            `You joined ${roomName}`
        );

    } catch (error) {

        console.error(error);

        updateStatus(
            `Connection error: ${error.message}`
        );
    }
}


async function leaveRoom() {

    if (!room) {
        return;
    }

    await room.disconnect();

    room = null;

    localVideo.innerHTML = "";
    remoteVideos.innerHTML = "";

    updateStatus("Disconnected");

    joinBtn.disabled = false;
    leaveBtn.disabled = true;
}


async function sendMessage() {

    if (!room) {
        alert("Join the room first.");
        return;
    }


    const message = chatInput.value.trim();

    if (!message) {
        return;
    }


    const payload =
        new TextEncoder().encode(
            JSON.stringify({
                sender:
                    room.localParticipant.identity,

                message: message
            })
        );


    await room.localParticipant.publishData(
        payload,
        {
            reliable: true,
            topic: "chat"
        }
    );


    addMessage("You", message);

    chatInput.value = "";
}


joinBtn.addEventListener(
    "click",
    joinRoom
);


leaveBtn.addEventListener(
    "click",
    leaveRoom
);


sendBtn.addEventListener(
    "click",
    sendMessage
);


chatInput.addEventListener(
    "keydown",
    event => {

        if (event.key === "Enter") {
            sendMessage();
        }

    }
);
