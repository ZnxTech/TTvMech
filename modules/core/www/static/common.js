const message_element = document.getElementById("message");

function sendMessage(prefix, message, classes) {
	is_message_vis = true;
	message_element.innerText = `${prefix} ${message}`;
	message_element.className = `box tx-b ${classes.join(" ")}`;
	message_countdown = 5000;
}

function hideMessage() {
	if (is_message_vis) {
		message_element.className = "box tx-b";
		is_message_vis = false;
	}
}

let message_countdown = -1;
setInterval(() => {
	if (message_countdown > 0) {
		message_countdown -= 1000;
	}
	if (message_countdown === 0) {
		hideMessage();
		message_countdown = -1;
	}
}, 1000);

document.addEventListener("ttv:sendMessage", (ev) => {
	const level = ev.detail.level;
	const message = ev.detail.message;

	if (!level || !message) {
		return;
	}

	switch (level) {
		case "info":
			sendMessage("[i]", message, ["vis", "bg-green"]);
			break;

		case "warn":
			sendMessage("[?]", message, ["vis", "bg-orange"]);
			break;

		case "err":
			sendMessage("[!]", message, ["vis", "bg-red"]);
			break;
	}
});
