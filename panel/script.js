const login = document.getElementById("login")

login.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/auth/discord";
});