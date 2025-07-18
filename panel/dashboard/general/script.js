const { animate } = Motion;
import { Interpreter } from '/interpreter.js'

function getBotId() {
    return window.location.pathname.split('/')[2];
}

const botId = getBotId();
const botIconElem = document.getElementById("boticon");
const botNameElem = document.getElementById("botname");
const loadingScreen = document.getElementById("loading-screen");
const rootElement = document.getElementById("root");
let botInfo

fetch(`/api/bot-info/${botId}`)
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            console.error(data.error);
            // window.location.href = "/dashboard/"
            return;
        }
        botInfo = data;

        botIconElem.setAttribute("src", data.avatar)
        botNameElem.innerText = data.username
    })
    .catch(error => {
        console.error(error);
    })
    .finally(() => {
        animate(
            loadingScreen,
            { opacity: 0 },
            { duration: 0.5, ease: "ease-out" }
        ).finished.then(() => {
            loadingScreen.style.display = 'none';
        });

        animate(rootElement, { opacity: 1 }, { duration: 0.5, delay: 0.2 });
    });

const prepareCode = document.getElementById("preparecode")

prepareCode.addEventListener("click", (e) => {
    let botConfig = {
        meta: {
            name: botInfo.username,
            description: "A multipurpose Discord bot",
            version: "1.0.0"
        },
        auth: {
            token: "user_provided_later",
        },
        presence: {
            type: document.getElementById("activitytype").value,
            text: document.getElementById("statustext").value
        },
    }
  
    // Create Interpreter instance
    const interpreter = new Interpreter(botConfig);

    // Preview main.js code inside <pre id="preview">
    // interpreter.preview();

    // Hook up download button
    interpreter.downloadZip();
})