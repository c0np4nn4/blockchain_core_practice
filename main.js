/* requires */
const CryptoJS = require("crypto-js");
const merkle = require("merkle");
const fs = require("fs");


/* class */
class BlockHeader {
    constructor(version, index, previousHash, timestamp, merkleRoot) {
        this.version = version;
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.merkleRoot = merkleRoot;
    }
}

class Block {
    constructor(header, data) {
        this.header = header;
        this.data = data;
    }
}

/* var */
// var blockchain = [];
var blockchain = [getGenesisBlock()];


/* function */
function getBlockchain() { return blockchain; }
function getLatestBlock() { return blockchain[blockchain.length - 1]; }
function calculateHash(version, index, previousHash, timestamp, merkleRoot) {
    return CryptoJS.SHA256(version + index + previousHash + timestamp + merkleRoot).toString().toUpperCase();
}

function calculateHashForBlock(block) {
    return calculateHash(
        block.header.version,
        block.header.index,
        block.header.previousHash,
        block.header.timestamp,
        block.header.merkleRoot
    );
}

function getGenesisBlock() {
    const version = "1.0.0";
    const index = 0;
    const previousHash = '0'.repeat(64);
    const timestamp = 1231006505; // 01/03/2009 @ 6:15pm (UTC)
    const data = ["The Times 03/Jan/2009 Chancellor on brink of second bailout for banks"];

    const merkleTree = merkle("sha256").sync(data);
    const merkleRoot = merkleTree.root() || '0'.repeat(64);

    const header = new BlockHeader(version, index, previousHash, timestamp, merkleRoot);
    return new Block(header, data);
}

function generateNextBlock(blockData) {
    const previousBlock = getLatestBlock();
    const currentVersion = getCurrentVersion();
    const nextIndex = previousBlock.header.index + 1;
    const previousHash = calculateHashForBlock(previousBlock);
    const nextTimestamp = getCurrentTimestamp();

    const merkleTree = merkle("sha256").sync(blockData);
    const merkleRoot = merkleTree.root() || '0'.repeat(64);

    const newBlockHeader = new BlockHeader(currentVersion, nextIndex, previousHash, nextTimestamp, merkleRoot);
    return new Block(newBlockHeader, blockData);
}

function getCurrentVersion() {
    const packageJson = fs.readFileSync("./package.json");
    const currentVersion = JSON.parse(packageJson).version;
    return currentVersion;
}

function getCurrentTimestamp() {
    return Math.round(new Date().getTime() / 1000);
}

// 블록 검증
function isValidNewBlock(newBlock, previousBlock) {

    // Structure
    if (isValidBlockStructure(newBlock)) {
        console.log('invalid block structure: %s', JSON.stringify(newBlock));
        return false;
    }

    // Index
    else if (previousBlock.header.index + 1 !== newBlock.header.index) {
        console.log("Invalid index");
        return false;
    }

    // Hash
    else if (calculateHashForBlock(previousBlock) !== newBlock.header.previousHash) {
        console.log("Invalid previousHash");
        return false;
    }

    // Merkle Root
    // if (data field is not empty)
    // else if (data field is empty)
    else if (
        (newBlock.data.length !== 0 && (merkle("sha256").sync(newBlock.data).root() !== newBlock.header.merkleRoot))
        || (newBlock.data.length === 0 && ('0'.repeat(64) !== newBlock.header.merkleRoot))
    ) {
        console.log("Invalid MerkleRoot");
        return false;
    }

    return true;
}

function isValidBlockStructure(block) {
    return typeof(block.header.version) === 'string'
    && typeof(block.header.index) === 'number'
    && typeof(block.header.previousBlock) === 'string'
    && typeof(block.header.timestamp) === 'number'
    && typeof(block.header.merkleRoot) === 'string'
    && typeof(block.header.data) === 'object';
}

// 블록체인 검증
function isValidChain(blockchainToValidate) {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        }
        else { return false; }
    }
    return true;
}

// 블록 추가
function addBlock(newBlock) {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
        return true;
    }
    return false;
}




// ch-2
const http_port = process.env.HTTP_PORT || 3001;
const p2p_port = process.env.P2P_PORT || 6001;

const p2p_test_port1 = process.env.P2P_TEST_PORT1 || 6002;
const p2p_test_port2 = process.env.P2P_TEST_PORT2 || 6003;

const WebSocket = require("ws");
const express = require("express");
const bodyParser = require("body-parser");

var sockets = [];

function initHttpServer() {
    const app = express();
    app.use(bodyParser.json());

    // get ledge from node
    app.get("/blocks", function (req, res) {
        res.send(getBlockchain());
    });

    // mining blocks contains data and updating ledge
    app.post("/mineBlock", function (req, res) {
        const data = req.body.data || [];
        const newBlock = mineBlock(data);
        if (newBlock == null) {
            res.status(400).send('Bad Request');
        }
        else {
            res.send(newBlock);
        }

        res.send(newBlock);
    });

    // get version from node
    app.get("/version", function (req, res) {
        res.send(getCurrentVersion());
    });

    // stop process
    app.post("/stop", function (req, res) {
        res.send({ "msg": "Stopping server" });
        process.exit();
    });

    // get peers info
    app.get("/peers", function (req, res) {
        var resStrings =[];
        getSockets().forEach(function(s){
            console.log(s._socket.remoteAddress);
            resStrings.push(s._socket.remoteAddress + ':' + s._socket.remotePort);
        });
        res.send(resStrings);
    });

    app.post("/addPeers", function (req, res) {
        const peers = req.body.peers || [];
        connectToPeers(peers);
        res.send();
    })
    app.listen(http_port, function () { console.log("Listening http port on: " + http_port) });
}

function initP2PServer() {
    const server = new WebSocket.Server({ port: p2p_port });
    server.on("connection", function (ws) { initConnection(ws); });
    console.log("Listening websocket p2p port on: " + p2p_port);
}

// since this implementation does not have "peer discovery", we have to put the address of websocket manually
function connectToPeers(newPeers) {
    newPeers.forEach(
        function (peer) {
            const ws = new WebSocket(peer);
            ws.on("open", function () { initConnection(ws); });
            ws.on("error", function () { console.log("Connection failed"); });
        }
    )
}

function getSockets() { return sockets; }

function initConnection(ws) {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());

    // sockets.forEach( function (s) {
    //     console.log(s._socket.remoteAddress);
    // });
    // console.log("sockets updated");
}

function write(ws, message) { ws.send(JSON.stringify(message)); }

function broadcast(message) {
    sockets.forEach(function (socket) {
        write(socket, message);
    });
}

// Message Handler
const MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

function initMessageHandler(ws) {
    ws.on("message", function (data) {
        const message = JSON.parse(data);

        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlochchainResponse(message);
                break;
        }
    });
}

function queryAllMsg() {
    return ({
        "type": MessageType.QUERY_ALL,
        "data": null
    });
}

function queryChainLengthMsg() {
    return ({
        "type": MessageType.QUERY_LATEST,
        "data": null
    });
}

function responseChainMsg() {
    return ({
        "type": MessageType.RESPONSE_BLOCKCHAIN,
        "data": JSON.stringify(getBlockchain())
    });
}

function responseLatestMsg() {
    return ({
        "type": MessageType.RESPONSE_BLOCKCHAIN,
        "data": JSON.stringify([getLatestBlock()])
    });
}

function handleBlockchainResponse(message) {
    // message contains the blockchain from other node
    const receivedBlocks = JSON.parse(message.data);
    const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    const latestBlockHeld = getLatestBlock();


    // validation test
    if (latestBlockReceived.header.index > latestBlockHeld.header.index) {
        console.log(
            "Blockchain possibly behind."
            + " We got: " + latestBlockHeld.header.index + ", "
            + " Peer got: " + latestBlockReceived.header.index
        );


        // 
        if (calculateHashForBlock(latestBlockHeld) === latestBlockReceived.header.previousHash) {
            // A received block refers the latest block of my ledger.
            console.log("We can append the received block to our chain");
            if (addBlock(latestBlockReceived)) {
                broadcast(responseLatestMsg());
            }
            else if (receivedBlocks.length === 1) {
                // Need to reorganize.
                console.log("We have to query the chain from our peer");
                broadcast(queryAllMsg());
            }
            else {
                // Replace chain
                console.log("Received blockchain is longer than current blockchain");
                replaceChain(receivedBlocks);
            }
        }
    }
    else { console.log("Received blockchain is not longer than current blockchain. Do nothing"); }
}

function initErrorHandler(ws) {
    ws.on("close", function () { closeConnection(ws); });
    ws.on("error", function () { closeConnection(ws); });
}

function closeConnection(ws) {
    console.log("Connection failed to peer: " + ws.url);
    sockets.splice(sockets.indexOf(ws), 1);
}

function mineBlock(blockData) {
    const newBlock = generateNextBlock(blockData);

    if (addBlock(newBlock)) {
        broadcast(responseLatestMsg());
        return newBlock;
    }
    else {
        return null;
    }
}

const random = require("random");

function replaceChain(newBlocks) {
    if (
        isValidChain(newBlocks)
        && (newBlocks.length > blockchain.length || (newBlocks.length === blockchain.length)
        && random.boolean())
        ) {
            console.log("Received blockchain is valid. Replacing current blockchain with received blockchain");
            blockchain = newBlocks;
            broadcast(responseLatestMsg());
        }
    else { console.log("Received blockchain invalid"); }

}

initHttpServer();
initP2PServer();