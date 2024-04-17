let form = document.getElementById("lobby__form");

let displayName = sessionStorage.getItem("display_name");
if (displayName) {
  form.name.value = displayName;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  sessionStorage.setItem("display_name", e.target.name.value);

  let roomName = e.target.room.value;
  if (!roomName) {
    roomName = String(Math.floor(Math.random() * 10000));
  }
  let roomNameLower = roomName.toLowerCase();
  window.location = `room.html?room=${roomNameLower}`;
});
