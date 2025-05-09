import { connect } from 'cloudflare:sockets';

// Global variables
let userID = 'd342d11e-d424-4583-b36e-524ab1f0afa4'; 
let proxyIP = '';
let subConverter = 'subconverter.example.com'; 
let subConfig = 'https://raw.githubusercontent.com/example/config/main/config.ini';
let subProtocol = 'https';
let subEmoji = 'true';
let socks5Address = '';
let parsedSocks5Address = {};
let enableSocks = false;
let noTLS = 'false';
const expire = -1;
let proxyIPs = [];
let socks5s = [];
let go2Socks5s = ['*example.com'];
let addresses = [];
let addressesapi = [];
let addressesnotls = [];
let addressesnotlsapi = [];
let addressescsv = [];
let DLS = 8;
let remarkIndex = 1;
let FileName = 'telegram-subscription';
let BotToken = '';
let ChatID = '';
let proxyhosts = [];
let proxyhostsURL = '';
let RproxyIP = 'false';
let httpsPorts = ["2053", "2083", "2087", "2096", "8443"];
let httpPorts = ["8080", "8880", "2052", "2082", "2086", "2095"];
let uuidExpireDays = 7;
let uuidRefreshHours = 3;
let userIDLow = '';
let userIDTime = '';
let proxyIPPool = [];
let path = '/apiws';
let dynamicUUID = 'd342d11e-d424-4583-b36e-524ab1f0afa4';
let links = [];
let blockedHosts = ['speed.cloudflare.com'];
const WS_READY_STATE_OPEN = 1;

// Utility functions
const utils = {
    isValidUUID(uuid) {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidPattern.test(uuid);
    },

    base64ToArrayBuffer(base64Str) {
        if (!base64Str) return { data: undefined, error: null };
        try {
            base64Str = base64Str.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = atob(base64Str);
            const byteArray = Uint8Array.from(decoded, c => c.charCodeAt(0));
            return { data: byteArray.buffer, error: null };
        } catch (error) {
            return { data: undefined, error };
        }
    },

    isValidIPv4(address) {
        const regexIPv4 = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return regexIPv4.test(address);
    }
};

// WebSocket Manager Class
class WebSocketManager {
    constructor(webSocket, logger) {
        this.webSocket = webSocket;
        this.logger = logger;
        this.readStreamCanceled = false;
        this.backpressure = false;
        this.messageQueue = [];
        this.processing = false;
    }

    createReadableStream(earlyDataHeader) {
        return new ReadableStream({
            start: (controller) => this.handleStreamStart(controller, earlyDataHeader),
            pull: (controller) => this.handleStreamPull(controller),
            cancel: (reason) => this.handleStreamCancel(reason),
        });
    }

    async handleStreamStart(controller, earlyDataHeader) {
        try {
            this.webSocket.addEventListener('message', (event) => {
                if (this.readStreamCanceled) return;
                if (!this.backpressure) {
                    this.handleMessage(event.data, controller);
                } else {
                    this.messageQueue.push(event.data);
                    this.logger('Backpressure detected, message queued');
                }
            });

            this.webSocket.addEventListener('close', () => this.handleClose(controller));
            this.webSocket.addEventListener('error', (error) => this.handleError(error, controller));

            await this.handleEarlyData(earlyDataHeader, controller);
        } catch (error) {
            this.logger(`Stream start error: ${error.message}`);
            controller.error(error);
        }
    }

    async handleMessage(data, controller) {
        if (this.processing) {
            this.messageQueue.push(data);
            return;
        }

        this.processing = true;
        try {
            controller.enqueue(data);
            while (this.messageQueue.length > 0 && !this.backpressure) {
                const queuedData = this.messageQueue.shift();
                controller.enqueue(queuedData);
            }
        } catch (error) {
            this.logger(`Message processing error: ${error.message}`);
        } finally {
            this.processing = false;
        }
    }

    handleStreamPull(controller) {
        if (controller.desiredSize > 0) {
            this.backpressure = false;
            while (this.messageQueue.length > 0 && controller.desiredSize > 0) {
                const data = this.messageQueue.shift();
                this.handleMessage(data, controller);
            }
        } else {
            this.backpressure = true;
        }
    }

    handleStreamCancel(reason) {
        if (this.readStreamCanceled) return;
        this.logger(`Read stream canceled: ${reason}`);
        this.readStreamCanceled = true;
        this.cleanup();
    }

    handleClose(controller) {
        this.cleanup();
        if (!this.readStreamCanceled) {
            controller.close();
        }
    }

    handleError(error, controller) {
        this.logger(`WebSocket error: ${error.message}`);
        if (!this.readStreamCanceled) {
            controller.error(error);
        }
        this.cleanup();
    }

    async handleEarlyData(earlyDataHeader, controller) {
        const { data, error } = utils.base64ToArrayBuffer(earlyDataHeader);
        if (error) {
            controller.error(error);
        } else if (data) {
            controller.enqueue(data);
        }
    }

    cleanup() {
        if (this.readStreamCanceled) return;
        this.readStreamCanceled = true;
        this.messageQueue = [];
        this.processing = false;
        this.backpressure = false;
        safeCloseWebSocket(this.webSocket);
    }
}

// Main request handler
export default {
    async fetch(request, env, context) {
        try {
            const UA = request.headers.get('User-Agent') || 'unknown';
            userID = env.UUID || userID;
            if (env.KEY) {
                dynamicUUID = env.KEY;
                uuidExpireDays = Number(env.TIME) || uuidExpireDays;
                uuidRefreshHours = Number(env.UPTIME) || uuidRefreshHours;
                const identifiers = await generateDynamicUUID(dynamicUUID);
                userID = identifiers[0];
                userIDLow = identifiers[1];
                userIDTime = identifiers[2];
            }

            // Response headers
            const responseHeaders = {
                'Server': 'Telegram',
                'Content-Type': 'text/html;charset=utf-8',
                'Content-Language': 'en',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            };

            if (!userID || !utils.isValidUUID(userID)) {
                const html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>Configuration Error</title>
                    <style>
                        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
                        .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); text-align: center; }
                        h1 { color: #d32f2f; }
                        .button { display: inline-block; padding: 10px 20px; background: #0088cc; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px; }
                        .button:hover { background: #006699; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Configuration Error</h1>
                        <p>Please configure a valid UUID in environment variables.</p>
                        <a href="/" class="button">Return to Home</a>
                    </div>
                </body>
                </html>`;
                return new Response(html, { status: 400, headers: responseHeaders });
            }

            // Read settings from KV
            if (env.KV) {
                try {
                    const kvProxyIP = await env.KV.get('PROXYIP.txt');
                    if (kvProxyIP) proxyIP = kvProxyIP.trim();
                } catch (error) {
                    console.error(`KV PROXYIP read error: ${error.message}`);
                }
                try {
                    const kvSocks5 = await env.KV.get('SOCKS5.txt');
                    if (kvSocks5) socks5Address = kvSocks5.trim();
                } catch (error) {
                    console.error(`KV SOCKS5 read error: ${error.message}`);
                }
            }

            proxyIP = proxyIP || env.PROXYIP || '';
            proxyIPs = await parseList(proxyIP);
            proxyIP = proxyIPs.length > 0 ? proxyIPs[Math.floor(Math.random() * proxyIPs.length)] : '';
            socks5s = await parseList(socks5Address);
            socks5Address = socks5s.length > 0 ? socks5s[Math.floor(Math.random() * socks5s.length)] : '';

            if (socks5Address) {
                try {
                    parsedSocks5Address = parseSocks5Address(socks5Address);
                    enableSocks = true;
                } catch (error) {
                    console.error(`SOCKS5 parse error: ${error.message}`);
                    enableSocks = false;
                }
            }

            const url = new URL(request.url);
            const upgradeHeader = request.headers.get('Upgrade');

            // Header validation
            const origin = request.headers.get('Origin') || '';
            const host = request.headers.get('Host') || '';
            if (!origin.includes('telegram.org') || !host.includes('telegram.org')) {
                console.warn('Invalid Origin/Host headers');
            }

            if (upgradeHeader === 'websocket') {
                return await handleVLESSOverWebSocket(request);
            }

            // HTTP request handling
            if (env.ADD) addresses = await parseList(env.ADD);
            if (env.ADDAPI) addressesapi = await parseList(env.ADDAPI);
            if (env.ADDNOTLS) addressesnotls = await parseList(env.ADDNOTLS);
            if (env.ADDNOTLSAPI) addressesnotlsapi = await parseList(env.ADDNOTLSAPI);
            if (env.ADDCSV) addressescsv = await parseList(env.ADDCSV);
            DLS = Number(env.DLS) || DLS;
            remarkIndex = Number(env.CSVREMARK) || remarkIndex;
            BotToken = env.TGTOKEN || BotToken;
            ChatID = env.TGID || ChatID;
            FileName = env.SUBNAME || FileName;
            subEmoji = env.SUBEMOJI || subEmoji;
            if (env.LINK) links = await parseList(env.LINK);

            const requestPath = url.pathname.toLowerCase();
            if (requestPath === '/') {
                const html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>Telegram Web</title>
                    <style>
                        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
                        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); text-align: center; }
                        h1 { color: #0088cc; margin-bottom: 20px; }
                        .button { display: inline-block; padding: 10px 20px; background: #0088cc; color: white; text-decoration: none; border-radius: 4px; }
                        .button:hover { background: #006699; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Welcome to Telegram Web</h1>
                        <p>Secure connection service masked as Telegram.</p>
                        <a href="/${userID}" class="button">Get Subscription</a>
                    </div>
                </body>
                </html>`;
                return new Response(html, { status: 200, headers: responseHeaders });
            }

            if (requestPath === `/${userID}`) {
                await sendMessage(`#Subscription request: ${FileName}`, request.headers.get('CF-Connecting-IP'), `UA: ${UA}\nDomain: ${url.hostname}`);
                const config = await generateConfig(userID, url.host, UA);
                return new Response(config, {
                    status: 200,
                    headers: {
                        ...responseHeaders,
                        'Content-Disposition': `attachment; filename=${FileName}`,
                        'Content-Type': 'text/plain;charset=utf-8',
                        'Profile-Update-Interval': '6',
                        'Subscription-Userinfo': `upload=0; download=0; total=1073741824; expire=${expire}`
                    }
                });
            }

            const errorHtml = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Access Error</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
                    .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); text-align: center; }
                    h1 { color: #d32f2f; }
                    .button { display: inline-block; padding: 10px 20px; background: #0088cc; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px; }
                    .button:hover { background: #006699; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Access Error</h1>
                    <p>Invalid path or UUID. Please check your request.</p>
                    <a href="/" class="button">Return to Home</a>
                </div>
            </body>
            </html>`;
            return new Response(errorHtml, { status: 404, headers: responseHeaders });
        } catch (error) {
            const serverErrorHtml = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Server Error</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
                    .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); text-align: center; }
                    h1 { color: #d32f2f; }
                    .button { display: inline-block; padding: 10px 20px; background: #0088cc; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px; }
                    .button:hover { background: #006699; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Server Error</h1>
                    <p>Error: ${error.message}</p>
                    <a href="/" class="button">Return to Home</a>
                </div>
            </body>
            </html>`;
            return new Response(serverErrorHtml, {
                status: 500,
                headers: {
                    'Server': 'Telegram',
                    'Content-Type': 'text/html;charset=utf-8',
                    'Content-Language': 'en',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                }
            });
        }
    }
};

// WebSocket handler for VLESS
async function handleVLESSOverWebSocket(request) {
    const webSocketPair = new WebSocketPair();
    const [client, webSocket] = Object.values(webSocketPair);
    webSocket.accept();

    let address = '';
    let portWithLog = '';
    const logger = (info, event = '') => {
        console.log(`[${new Date().toISOString()}] [${address}:${portWithLog}] ${info}`, event);
    };

    const earlyDataHeader = request.headers.get('sec-websocket-protocol') || '';
    const webSocketReadableStream = new WebSocketManager(webSocket, logger).createReadableStream(earlyDataHeader);

    let remoteSocketWrapper = { value: null };
    let isDNS = false;
    const blockedHostsSet = new Set(blockedHosts);

    webSocketReadableStream.pipeTo(new WritableStream({
        async write(chunk, controller) {
            try {
                if (isDNS) {
                    return handleDNSQuery(chunk, webSocket, null, logger);
                }
                if (remoteSocketWrapper.value) {
                    const writer = remoteSocketWrapper.value.writable.getWriter();
                    await writer.write(chunk);
                    writer.releaseLock();
                    return;
                }

                const {
                    hasError,
                    message,
                    addressType,
                    remotePort = 443,
                    remoteAddress = '',
                    rawDataIndex,
                    vlessVersion = new Uint8Array([0, 0]),
                    isUDP
                } = processVlessHeader(chunk, userID);

                address = remoteAddress;
                portWithLog = `${remotePort}--${Math.random()} ${isUDP ? 'udp' : 'tcp'}`;
                if (hasError) throw new Error(message);
                if (isUDP) {
                    if (remotePort === 53) isDNS = true;
                    else throw new Error('UDP only supported for DNS (port 53)');
                }

                const vlessResponseHeader = new Uint8Array([vlessVersion[0], 0]);
                const rawClientData = chunk.slice(rawDataIndex);

                if (isDNS) {
                    return handleDNSQuery(rawClientData, webSocket, vlessResponseHeader, logger);
                }
                if (!blockedHostsSet.has(remoteAddress)) {
                    logger(`Handling TCP connection ${remoteAddress}:${remotePort}`);
                    await handleOutboundTCP(remoteSocketWrapper, addressType, remoteAddress, remotePort, rawClientData, webSocket, vlessResponseHeader, logger);
                } else {
                    throw new Error(`Blocked host: ${remoteAddress}`);
                }
            } catch (error) {
                logger(`Data processing error: ${error.message}`);
                safeCloseWebSocket(webSocket);
            }
        },
        close() {
            logger('WebSocket readable stream closed');
        },
        abort(reason) {
            logger(`WebSocket readable stream aborted: ${reason}`);
        }
    })).catch((error) => {
        logger(`WebSocket pipe error: ${error.message}`);
        safeCloseWebSocket(webSocket);
    });

    return new Response(null, {
        status: 101,
        webSocket: client,
        headers: {
            'Server': 'Telegram',
            'Upgrade': 'websocket',
            'Connection': 'Upgrade',
            'Content-Language': 'en'
        }
    });
};

// DNS query handling
async function handleDNSQuery(udpChunk, webSocket, vlessResponseHeader, logger) {
    const DNS_SERVER = { hostname: '85.209.2.112', port: 53 };
    let tcpSocket;
    try {
        tcpSocket = await connect({ hostname: DNS_SERVER.hostname, port: DNS_SERVER.port });
        logger(`Connected to DNS: ${DNS_SERVER.hostname}:${DNS_SERVER.port}`);
        const writer = tcpSocket.writable.getWriter();
        await writer.write(udpChunk);
        writer.releaseLock();

        const reader = tcpSocket.readable.getReader();
        let vlessHeader = vlessResponseHeader;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (webSocket.readyState !== WS_READY_STATE_OPEN) break;
            const data = vlessHeader ? mergeData(vlessHeader, value) : value;
            webSocket.send(data);
            vlessHeader = null;
        }
        reader.releaseLock();
    } catch (error) {
        logger(`DNS query error: ${error.message}`);
    } finally {
        if (tcpSocket) tcpSocket.close();
        safeCloseWebSocket(webSocket);
    }
}

// Data merging
function mergeData(header, chunk) {
    const merged = new Uint8Array(header.length + chunk.length);
    merged.set(header, 0);
    merged.set(chunk, header.length);
    return merged;
}

// TCP outbound handling
async function handleOutboundTCP(remoteSocket, addressType, remoteAddress, remotePort, rawClientData, webSocket, vlessResponseHeader, logger) {
    let tcpSocket;
    try {
        tcpSocket = await connect({ hostname: proxyIP || remoteAddress, port: remotePort });
        remoteSocket.value = tcpSocket;
        const writer = tcpSocket.writable.getWriter();
        await writer.write(rawClientData);
        writer.releaseLock();

        await relaySocketToWebSocket(tcpSocket, webSocket, vlessResponseHeader, logger);
    } catch (error) {
        logger(`TCP connection error: ${error.message}`);
        safeCloseWebSocket(webSocket);
    }
}

// Socket to WebSocket relay
async function relaySocketToWebSocket(remoteSocket, webSocket, responseHeader, logger) {
    let header = responseHeader;
    try {
        await remoteSocket.readable.pipeTo(new WritableStream({
            write(chunk) {
                if (webSocket.readyState !== WS_READY_STATE_OPEN) throw new Error('WebSocket closed');
                const data = header ? mergeData(header, chunk) : chunk;
                webSocket.send(data);
                header = null;
            },
            close() {
                logger('Remote connection closed');
            },
            abort(reason) {
                logger(`Remote connection aborted: ${reason}`);
            }
        }));
    } catch (error) {
        logger(`Data relay error: ${error.message}`);
        safeCloseWebSocket(webSocket);
    }
}

// VLESS header processing
function processVlessHeader(buffer, userID) {
    if (buffer.byteLength < 24) return { hasError: true, message: 'Invalid data' };
    const version = new Uint8Array(buffer.slice(0, 1));
    const idBytes = new Uint8Array(buffer.slice(1, 17));
    const idString = bytesToString(idBytes);
    if (idString !== userID && idString !== userIDLow) return { hasError: true, message: 'Invalid user' };
    const optionsLength = new Uint8Array(buffer.slice(17, 18))[0];
    const command = new Uint8Array(buffer.slice(18 + optionsLength, 19 + optionsLength))[0];
    let isUDP = command === 2;
    if (command !== 1 && command !== 2) return { hasError: true, message: 'Unsupported command' };
    const portIndex = 19 + optionsLength;
    const remotePort = new DataView(buffer).getUint16(portIndex);
    const addressIndex = portIndex + 2;
    const addressType = new Uint8Array(buffer.slice(addressIndex, addressIndex + 1))[0];
    let remoteAddress = '';
    let addressLength = 0;
    let addressValueIndex = addressIndex + 1;
    switch (addressType) {
        case 1:
            addressLength = 4;
            remoteAddress = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join('.');
            break;
        case 2:
            addressLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0];
            addressValueIndex += 1;
            remoteAddress = new TextDecoder().decode(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
            break;
        case 3:
            addressLength = 16;
            const dataView = new DataView(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
            const ipv6 = [];
            for (let i = 0; i < 8; i++) ipv6.push(dataView.getUint16(i * 2).toString(16));
            remoteAddress = ipv6.join(':');
            break;
        default:
            return { hasError: true, message: 'Invalid address type' };
    }
    return {
        hasError: false,
        remoteAddress,
        addressType,
        remotePort,
        rawDataIndex: addressValueIndex + addressLength,
        vlessVersion: version,
        isUDP
    };
}

// Config generation
async function generateConfig(UUID, host, UA) {
    let config = `vless://${UUID}@${host}:443?` +
        `encryption=none&` +
        `security=tls&` +
        `sni=${host}&` +
        `fp=randomized&` +
        `alpn=h3&` +
        `type=ws&` +
        `host=${host}&` +
        `path=${encodeURIComponent(path)}` +
        `#Telegram-Web`;
    if (UA.includes('clash') || UA.includes('sing-box')) {
        try {
            const response = await fetch(`${subProtocol}://${subConverter}/sub?target=${UA.includes('clash') ? 'clash' : 'sing-box'}&url=${encodeURIComponent(config)}&config=${subConfig}&emoji=${subEmoji}`);
            const text = await response.text();
            return btoa(text);
        } catch (error) {
            console.error(`Subscription converter error: ${error.message}`);
            return btoa(config);
        }
    }
    return btoa(config);
}

// SOCKS5 address parsing
function parseSocks5Address(socks5Address) {
    const parts = socks5Address.split('@');
    if (parts.length === 2) {
        const [username, password] = parts[0].split(':');
        const [host, port] = parts[1].split(':');
        return { username, password, host, port };
    }
    const [host, port] = socks5Address.split(':');
    return { username: '', password: '', host, port };
}

// List parsing
async function parseList(content) {
    if (!content) return [];
    return content.split(',').map(s => s.trim()).filter(s => s);
}

// Telegram message sending
async function sendMessage(type, ip, additionalData) {
    if (!BotToken || !ChatID) return;
    try {
        const message = `${type}\nIP: ${ip}\n${additionalData}`;
        await fetch(`https://api.telegram.org/bot${BotToken}/sendMessage?chat_id=${ChatID}&parse_mode=HTML&text=${encodeURIComponent(message)}`);
    } catch (error) {
        console.error(`Message send error: ${error.message}`);
    }
}

// Dynamic UUID generation
async function generateDynamicUUID(key) {
    const baseDate = new Date(2023, 0, 1);
    const weekMillis = 1000 * 60 * 60 * 24 * uuidExpireDays;
    const currentWeek = Math.ceil((Date.now() - baseDate) / weekMillis);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${key}${currentWeek}`));
    const hashArray = Array.from(new Uint8Array(hash));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const uuid = `${hashHex.slice(0, 8)}-${hashHex.slice(8, 12)}-4${hashHex.slice(12, 15)}-8${hashHex.slice(15, 18)}-${hashHex.slice(18, 30)}`;
    return [uuid, uuid.toLowerCase(), new Date(baseDate.getTime() + currentWeek * weekMillis).toISOString()];
}

// Safe WebSocket closure
function safeCloseWebSocket(webSocket) {
    if (webSocket.readyState === WS_READY_STATE_OPEN) webSocket.close();
}

// Byte array to UUID string
function bytesToString(byteArray) {
    return Array.from(byteArray).map(b => b.toString(16).padStart(2, '0')).join('');
}