fetch('/api/user')
  .then(res => {
    if (res.status === 401) return window.location.href = '/auth/discord';
    return res.json();
  })
  .then(user => {
    document.getElementById('welcome').innerText = `Bienvenue, ${user.username}`;
    document.getElementById('avatar').src = user.avatar;
  })
  .catch(err => console.error('Failed to load user:', err));