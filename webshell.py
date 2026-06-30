import asyncio
import subprocess
import json
import os
import struct
import signal

HOST = "0.0.0.0"
PORT = 8888

async def handle_client(reader, writer):
    """Simple HTTP + WebSocket terminal server."""
    data = await reader.read(65536)
    if not data:
        return

    request = data.decode("utf-8", errors="replace")

    if "Upgrade: websocket" in request or "upgrade: websocket" in request:
        # Extract WebSocket key
        key = ""
        for line in request.split("\r\n"):
            if "Sec-WebSocket-Key" in line:
                key = line.split(":")[1].strip()
                break

        if not key:
            writer.close()
            return

        import hashlib
        import base64

        accept_key = base64.b64encode(
            hashlib.sha1(
                (key + "258EAFA5-E914-47DA-95CA-5AB5A6D98D6C").encode()
            ).digest()
        ).decode()

        response = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept_key}\r\n"
            "\r\n"
        )
        writer.write(response.encode())
        await writer.drain()

        proc = await asyncio.create_subprocess_shell(
            os.environ.get("SHELL", "powershell.exe"),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        async def ws_send(data_bytes, opcode=0x1):
            length = len(data_bytes)
            header = bytearray()
            header.append(0x80 | (opcode & 0x0F))
            if length < 126:
                header.append(length)
            elif length < 65536:
                header.append(126)
                header.extend(struct.pack(">H", length))
            else:
                header.append(127)
                header.extend(struct.pack(">Q", length))
            writer.write(bytes(header) + data_bytes)
            await writer.drain()

        async def read_stdout():
            while True:
                line = await proc.stdout.read(4096)
                if not line:
                    break
                await ws_send(line)

        async def read_ws():
            while True:
                try:
                    raw = await reader.read(65536)
                    if not raw:
                        break
                    # Parse WebSocket frame
                    if len(raw) < 2:
                        continue
                    fin = raw[0] >> 7
                    opcode = raw[0] & 0x0F
                    masked = raw[1] >> 7
                    length = raw[1] & 0x7F
                    offset = 2
                    if length == 126:
                        length = struct.unpack(">H", raw[2:4])[0]
                        offset = 4
                    elif length == 127:
                        length = struct.unpack(">Q", raw[2:10])[0]
                        offset = 10
                    if masked:
                        mask = raw[offset:offset+4]
                        offset += 4
                        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(raw[offset:offset+length]))
                    else:
                        payload = raw[offset:offset+length]

                    if opcode == 0x8:
                        break
                    elif opcode == 0x9:
                        await ws_send(b"", 0xA)
                    elif opcode == 0x2 or opcode == 0x1:
                        if proc.stdin:
                            proc.stdin.write(payload)
                            await proc.stdin.drain()
                except Exception:
                    break

        await asyncio.gather(read_stdout(), read_ws())
        if proc:
            proc.terminate()

    else:
        html = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #1a1a2e; color: #00ff00; font-family: 'Courier New', monospace; height: 100vh; overflow: hidden; }
#terminal { height: 100vh; overflow-y: auto; padding: 10px; font-size: 14px; line-height: 1.4; }
#input-line { display: flex; padding: 5px 10px; background: #16213e; }
#prompt { color: #00ff00; white-space: pre; }
#cmd { flex: 1; background: transparent; border: none; color: #00ff00; font-family: 'Courier New', monospace; font-size: 14px; outline: none; }
#cmd::placeholder { color: #0a5a0a; }
</style>
</head>
<body>
<div id="terminal"></div>
<div id="input-line"><span id="prompt">PS C:\\&gt; </span><input id="cmd" autofocus placeholder="type command..."></div>
<script>
const term = document.getElementById('terminal');
const cmdInput = document.getElementById('cmd');
const ws = new WebSocket('ws://' + location.host + '/ws');
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let buffer = '';
ws.onmessage = (e) => {
    const text = decoder.decode(e.data instanceof Blob ? await e.data.arrayBuffer() : e.data);
    buffer += text;
    const lines = buffer.split('\n');
    if (lines.length > 100) { lines.splice(0, lines.length - 100); buffer = lines.join('\n'); }
    term.textContent = buffer;
    term.scrollTop = term.scrollHeight;
};
async function sendCmd() {
    const cmd = cmdInput.value;
    cmdInput.value = '';
    ws.send(encoder.encode(cmd + '\n'));
}
cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCmd(); });
</script>
</body>
</html>"""
        response = f"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {len(html)}\r\n\r\n{html}"
        writer.write(response.encode())
        await writer.drain()

    writer.close()

async def main():
    server = await asyncio.start_server(handle_client, HOST, PORT)
    print(f"Web terminal at http://{HOST}:{PORT}")
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    asyncio.run(main())
