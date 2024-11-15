import asyncio
import websockets
from flask import Flask, request, jsonify
import threading

# Bugs - terminate server with kill command does not work.
# Create Flask app to receive binary point cloud data
app = Flask(__name__)

# Store the WebSocket connections
clients = set()

# WebSocket server function
async def websocket_handler(websocket, path):
    # Register the new client
    clients.add(websocket)
    print(f"Client connected, currently {len(clients)} connected.")
    try:
        async for message in websocket:
            pass  # We don't need to handle incoming messages from clients
    finally:
        # Unregister the client if disconnected
        clients.remove(websocket)
        print("Client disconnected")

# Broadcast binary data to all connected clients
async def broadcast_point_cloud(data):
    if clients:  # Only send if there are connected clients
        print(f"Broadcasting point cloud blob to {len(clients)} clients")
        await asyncio.wait([client.send(data) for client in clients])

# Define a POST endpoint in Flask to accept binary point cloud data
@app.route('/send-point-cloud', methods=['POST'])
def send_point_cloud():
    try:
        point_cloud_data = request.data  # Binary data from request
        print(f"Received binary data of length: {len(point_cloud_data)} bytes")

        # Schedule the broadcast to WebSocket clients
        asyncio.run_coroutine_threadsafe(
            broadcast_point_cloud(point_cloud_data), app.config['loop']
        )

        return jsonify({'status': 'Point cloud blob sent to WebSocket clients'})
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'status': 'Error', 'message': str(e)}), 500

# Function to run Flask app in a separate thread
def run_flask():
    app.run(host='0.0.0.0', port=3002, debug=False, use_reloader=False)

# Start the WebSocket server
async def start_websocket_server(stop_event):
    server = await websockets.serve(websocket_handler, "localhost", 3001)
    print("WebSocket server started on ws://localhost:3001")

    # Store the event loop so Flask can use it
    app.config['loop'] = asyncio.get_event_loop()

    # Wait for the stop_event to be set from another thread
    await stop_event.wait()

    # Cleanly shutdown the WebSocket server
    server.close()
    await server.wait_closed()
    print("WebSocket server closed.")

# Main function
def main():
    # Use a threading.Event to signal Flask shutdown
    stop_event = threading.Event()

    # Run Flask app in a separate thread
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.start()

    try:
        # Create an asyncio event in the same loop where asyncio.run() is called
        async def websocket_server_wrapper():
            asyncio_stop_event = asyncio.Event()  # Created in the same loop
            # Run the WebSocket server and wait for the Flask thread to signal shutdown
            asyncio.create_task(start_websocket_server(asyncio_stop_event))
            # Wait for the threading stop event to be set
            await asyncio.get_event_loop().run_in_executor(None, stop_event.wait)
            # Signal the asyncio stop event
            asyncio_stop_event.set()

        asyncio.run(websocket_server_wrapper())

    except KeyboardInterrupt:
        print("Received Ctrl+C, shutting down servers.")
        stop_event.set()  # Signal the Flask server thread to stop

        # Ensure Flask stops cleanly
        if flask_thread.is_alive():
            flask_thread.join(timeout=5)  # Wait for Flask to shut down
    finally:
        print("Application exited cleanly.")

if __name__ == "__main__":
    main()