const css = `
.static-spinner::before,
.static-spinner::after {
    border: 2px solid;
    border-left: none;
    box-sizing: border-box;
    content: '';
    display: block;
    position: absolute;
    top: 50%;
    left: 50%;
    -webkit-transform: translateY(-50%);
    transform: translateY(-50%);
    -webkit-transform-origin: 0% 50%;
    transform-origin: 0% 50%;
    -webkit-animation: spinner-spin 1s linear 0s infinite;
    animation: spinner-spin 1s linear 0s infinite;
    border-width: 3px;
    border-color: #aaa;
}

.static-spinner::before {
    width: 15px;
    height: 30px;
    border-radius: 0 30px 30px 0;
}

.static-spinner::after {
    width: 8px;
    height: 16px;
    border-radius: 0 16px 16px 0;
    animation-direction: reverse;
}

@-webkit-keyframes spinner-spin {
    0% {
        -webkit-transform: translateY(-50%) rotate(0deg);
        transform: translateY(-50%) rotate(0deg);
    }

    100% {
        -webkit-transform: translateY(-50%) rotate(360deg);
        transform: translateY(-50%) rotate(360deg);
    }
}

@keyframes spinner-spin {
    0% {
        -webkit-transform: translateY(-50%) rotate(0deg);
        transform: translateY(-50%) rotate(0deg);
    }

    100% {
        -webkit-transform: translateY(-50%) rotate(360deg);
        transform: translateY(-50%) rotate(360deg);
    }
}

.hand-prompt {
    display: block;
    position: absolute;
    top: 50%;
    left: 50%;
    width: 90px;
    height: 90px;
    pointer-events: none;
    z-index: 9999999999999;

    transform: translate(-50%, -50%);
    -webkit-animation: prompt-animate 1s ease-in-out 0s infinite alternate;
    animation: prompt-animate 1s ease-in-out 0s infinite alternate;

    -webkit-filter: drop-shadow(5px 5px 5px #888);
    filter: drop-shadow(5px 5px 5px #888);
}

@-webkit-keyframes prompt-animate {
    0% {
        -webkit-transform: translate(-125%, -50%);
        transform: translate(-125%, -50%);
    }

    100% {
        -webkit-transform: translate(25%, -50%);
        transform: translate(25%, -50%);
    }
}

@keyframes prompt-animate {
    0% {
        -webkit-transform: translate(-125%, -50%);
        transform: translate(-125%, -50%);
    }

    100% {
        -webkit-transform: translate(25%, -50%);
        transform: translate(25%, -50%);
    }
}
`;

let container: HTMLElement;
let spinner: HTMLElement;

const startSpinner = () => {
    container = document.createElement('div');
    const style = document.createElement('style');
    style.innerText = css;
    container.appendChild(style);
    spinner = document.createElement('div');
    spinner.className = 'static-spinner';
    container.appendChild(spinner);
    document.getElementById('app').appendChild(container);
};

const stopSpinner = () => {
    if (spinner) {
        container.removeChild(spinner);
    }
};

export {startSpinner, stopSpinner};
