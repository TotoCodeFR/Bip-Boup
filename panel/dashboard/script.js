fetch('/api/user')
  .then(res => {
    if (res.status === 401 || res.status === 302) return window.location.href = '/auth/discord';
    return res.json();
  })
  .then(user => {
    document.getElementById('welcome').innerText = `Bienvenue, ${user.username}`;
    document.getElementById('avatar').src = user.avatar;
  })
  .catch(err => console.error('Failed to load user:', err));

const botsGrid = document.getElementById('bots')

fetch('/api/get-bots')
  .then(res => {
    if (res.status === 401 || res.status === 302) return window.location.href = '/auth/discord';
    return res.json();
  })
  .then(bots => {
    bots.forEach(bot => {
      if (!bot.avatar) bot.avatar = "https://cdn.discordapp.com/embed/avatars/3.png"
      const botElem = document.createElement('div')
      botElem.classList.add('bots-card')
      botElem.innerHTML = `
      <img src="${bot.avatar}" width="64" height="64" style="border-radius: 100%;">
      <h3>${bot.name}</h3>
      <a href="/dashboard/${bot.id}/general"><button>Voir</button></a>
      `

      botsGrid.appendChild(botElem)
    });
  })
  .catch(err => console.error('Failed to load user:', err));

const addBotBtn = document.getElementById('addbot');
const addBotPopup = document.getElementById('addbotpopup');
const cancelBtn = document.getElementById('addbotpopup__cancel');
const addBotConfirm = document.getElementById('addbotpopup__add');
const mainContent = document.getElementById('main-content');

const { animate, spring } = Motion;

function showPopup() {
  mainContent.classList.add('blurred');
  addBotPopup.style.visibility = 'visible';
  animate(
    addBotPopup,
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
    { duration: 0.4, easing: spring({ stiffness: 200, damping: 20 }) }
  );
}

function hidePopup() {
  mainContent.classList.remove('blurred');
  animate(
    addBotPopup,
    { opacity: 0, transform: 'translate(-50%, -50%) scale(0.9)' },
    { duration: 0.2, easing: 'ease-out' }
  ).finished.then(() => {
    addBotPopup.style.visibility = 'hidden';
  });
}

addBotBtn.addEventListener('click', showPopup);
cancelBtn.addEventListener('click', hidePopup);
addBotConfirm.addEventListener('click', () => {
  const botToken = document.getElementById('addbotpopup__token').value

  fetch('/api/add-bot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bot_token: botToken }),
  })
    .then(response => response.json())
    .then(data => {
      console.log('Success:', data);
      hidePopup()
    })
    .catch((error) => {
      console.error('Error:', error);
    });
})