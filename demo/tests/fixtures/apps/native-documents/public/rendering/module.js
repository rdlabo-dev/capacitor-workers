import { message } from "./message.js";
document.querySelector("#module").textContent = message;
const response = await fetch("../api/message");
document.querySelector("#api").textContent = (await response.json()).message;
