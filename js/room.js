let messagesContainer = document.getElementById("messages");
messagesContainer.scrollTop = messagesContainer.scrollHeight;

const memberContainer = document.getElementById("members__container");
const memberButton = document.getElementById("members__button");

const chatContainer = document.getElementById("messages__container");
const chatButton = document.getElementById("chat__button");

let activeMemberContainer = false;

memberButton.addEventListener("click", () => {
  if (activeMemberContainer) {
    memberContainer.style.display = "none";
  } else {
    memberContainer.style.display = "flex";
  }

  activeMemberContainer = !activeMemberContainer;
});

let activeChatContainer = false;

chatButton.addEventListener("click", () => {
  if (activeChatContainer) {
    chatContainer.style.display = "none";
  } else {
    chatContainer.style.display = "flex";
  }

  activeChatContainer = !activeChatContainer;
});

let displayFrame = document.getElementById("stream__box");
let videoFrames = document.getElementsByClassName("video__container");
let userIdInDisplayFrame = null;


let hideDisplayFrame = () => {
  userIdInDisplayFrame = null;
  displayFrame.style.display = null;

  let child = displayFrame.children[0];
  document.getElementById("streams__container").appendChild(child);

  for (let i = 0; videoFrames.length > i; i++) {
    videoFrames[i].style.height = "300px";
    videoFrames[i].style.width = "300px";
  }
};

displayFrame.addEventListener("click", hideDisplayFrame);
