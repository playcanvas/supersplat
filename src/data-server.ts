import { path } from 'playcanvas';
import { Scene } from './scene';
import { Events } from './events';
import { CreateDropHandler } from './drop-handler';
import { convertPly, convertPlyCompressed, convertSplat } from './splat-convert';
import { startSpinner, stopSpinner } from './ui/spinner';
import { ElementType } from './element';
import { Splat } from './splat';

interface DataServerDetails {
    host: string;
    port: string;
}

// initialize data server events
const initDataServer = async (scene: Scene, events: Events, dropTarget: HTMLElement) => {

    let socket: WebSocket;
    let dataServerDetails = {
        host: "localhost",
        port: "3001"
    }
    events.function('scene.start-data-server', async () => {
        if (socket){
            if (socket.readyState != socket.CLOSED){
                console.error('WebSocket error:', "Socket already initialized");
                return;
            }
        }

        // Open WebSocket connection
        socket = new WebSocket(`ws://${dataServerDetails.host}:${dataServerDetails.port}`);
        socket.binaryType = 'blob';

        // Handle server open event
        socket.onopen = () => {
            events.fire('scene.data-server-opened');
            console.log('WebSocket connection established');
        };

        // Handle server close event
        socket.onclose = () => {
            events.fire('scene.data-server-closed');
            console.log('WebSocket connection closed');
        };

        // When a message is received from the server
        socket.onmessage = async (event) => {
            if (event.data instanceof Blob){
                try {
                    // First 64 bytes used for message type
                    const msgtype = (await event.data.slice(0, 64).text()).replace(/\0+$/, '');
                    
                    if(msgtype == "PLY"){
                        // 64 bytes used for file name
                        const name = (await event.data.slice(64, 128).text()).replace(/\0+$/, '');
                        const data = event.data.slice(128, event.data.size);

                        const url = URL.createObjectURL(data);
                        await scene.updateModel(url, name);
                        URL.revokeObjectURL(url);
                    }
                    else if(msgtype=="LABELS"){
                        // 64 bytes used for file name
                        const name = (await event.data.slice(64, 128).text()).replace(/\0+$/, '');
                        const data = await event.data.slice(128, event.data.size).text();
                        const labels = JSON.parse(data);
                        await scene.updateLabels(labels, name);
                    }
                    else{
                        throw Error("Unknown message type: "+msgtype)
                    }

                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error(error);
                    }
                }
            }
        };

        // Handle errors
        socket.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

    });
};

export { initDataServer };
