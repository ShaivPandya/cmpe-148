import './style.css'

import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDh4rFOZU6fRjpxZ1r8J3K3jK7RtyO7xnw",
  authDomain: "chatapp-84cdb.firebaseapp.com",
  projectId: "chatapp-84cdb",
  storageBucket: "chatapp-84cdb.appspot.com",
  messagingSenderId: "1089446290213",
  appId: "1:1089446290213:web:aabb538435289a9d7530cc",
  measurementId: "G-D655MCE7LK"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;
let isMuted = false;
let isVideoEnabled = true;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const micButton = document.getElementById('micButton');
const toggleVideoButton = document.getElementById('toggleVideoButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
  micButton.disabled = false;
  toggleVideoButton.disabled = false;
  hangupButton.disabled = false;
};

// Function to handle mute/unmute toggle
function toggleMute() {
  // Toggle the mute state
  isMuted = !isMuted;
  // Mute/unmute the audio tracks in the local stream
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted;
  });
  // Update the button text based on mute state
  micButton.innerText = isMuted ? 'Unmute' : 'Mute';
}
micButton.addEventListener('click', toggleMute);

// Function to handle video toggle
function toggleVideo() {
  // Toggle the video state
  isVideoEnabled = !isVideoEnabled;

  // Enable/disable the video tracks in the local stream
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = isVideoEnabled;
  });

  // Update the button text based on video state
  toggleVideoButton.innerText = isVideoEnabled ? 'Disable Video' : 'Enable Video';
}
// Add click event listener to the toggleVideoButton
toggleVideoButton.addEventListener('click', toggleVideo);

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};

// Function to handle hang-up
function hangup() {
  // Stop the local stream tracks
  localStream.getTracks().forEach((track) => track.stop());

  // Close the peer connection (assuming 'pc' is your peer connection variable)
  if (pc) {
    pc.close();
  }

  // Reset video elements
  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Disable buttons as needed
  callButton.disabled = true;
  answerButton.disabled = true;
  webcamButton.disabled = false;
  micButton.disabled = true;
  toggleVideoButton.disabled = true;
  hangupButton.disabled = true;
}

// Add click event listener to the hangupButton
hangupButton.addEventListener('click', hangup);