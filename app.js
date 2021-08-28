"use strict";
//const BAUD_RATE = 1200;
const BAUD_RATE = 9600; // TODO: add user setting and close button
const BLK_GEN = 0x51;
const BLK_BAS = 0x52;
const BLK_PAS = 0x53;
const BLK_THR = 0x54;
const CMD_READ = 0x11;
const CMD_WRITE = 0x16;
const blockNumBytes = {
        [BLK_GEN]: 19,
        [BLK_BAS]: 27,
        [BLK_PAS]: 14,
        [BLK_THR]: 9,
};
const blockKeys = {
        [BLK_GEN]: "info",
        [BLK_BAS]: "basic",
        [BLK_PAS]: "pedal",
        [BLK_THR]: "throttle",
};

class BafangConfig {
    constructor() {
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        this.byteCount = 0;
        this.buffer = null;
    }
    data = {}; // NOTE: when writing to file, skip "info" block

    // callbacks
    onResponse = function(blk, err) {};
    onSerialConnect = function(port) {};
    
    processReadResponse(buf) {
        const blk = buf[0];
        if(blk < BLK_GEN || blk > BLK_THR) {
            this.logError("Unexpected block in response, ignoring");
        } else {
            this.data[blockKeys[blk]] = this.parseData(buf);
            this.onResponse(blk, null);
            this.logMsg("Read successful");
        }
    }
    parseData(buf) {
        const blk = buf[0];
        console.log("Got block:",blockKeys[blk]);
        switch(blk) {
            case BLK_GEN: return this.parseGenData(buf);
            case BLK_BAS: return this.parseBasData(buf);
            case BLK_PAS: return this.parsePasData(buf);
            case BLK_THR: return this.parseThrData(buf);
            break;
        }
    }
    parseGenData(buf) {
        let voltage = buf[16] > 4 ? "24V-60V" : ["24V","36V","48V","60V","24V-48V"][buf[16]];
        return {
            manufacturer:   String.fromCharCode.apply(null, buf.slice(2,2+4)),
            model:          String.fromCharCode.apply(null, buf.slice(6,6+4)),
            hw_ver:         String.fromCharCode.apply(null, buf.slice(10,12)).split("").join("."),
            fw_ver:         String.fromCharCode.apply(null, buf.slice(12,16)).split("").join("."),
            voltage:        voltage,
            max_current:    buf[17],
        };
    }
    parseBasData(buf) {
        let data = {
            low_battery_protect:    buf[2],
            current_limit:          buf[3],
            wheel_size:             buf[24]==0x37 ? "700C" : (Math.ceil(buf[24]/2) + '"'),
            speedmeter_model:       ["External","Internal","Motorphase"][buf[25] >> 6],
            speedmeter_signals:     buf[25] & 63,
        };
        for(i=0;i<10;i++) {
            data["assist"+i+"_current"] = buf[4+i];
            data["assist"+i+"_speed"] = buf[14+i];
        }
        return data;
    }
    parsePasData(buf) {
        return {
            pedal_type:         ["None","DH-Sensor-12","BB-Sensor-32","DoubleSignal-24"][buf[2]],
            designated_assist:  buf[3]==0xff?"Display":buf[3],
            speed_limit:        buf[4]==0xff?"Display":buf[4],
            start_current:      buf[5],
            slow_start_mode:    buf[6],
            startup_degree:     buf[7],
            work_mode:          buf[8]==0xff?"Undetermined":buf[8],
            time_of_stop:       buf[9],
            current_decay:      buf[10],
            stop_decay:         buf[11],
            keep_current:       buf[12],
        };
    }
    parseThrData(buf) {
        return {
            start_voltage:      buf[2],
            end_voltage:        buf[3],
            mode:               ["Speed","Current"][buf[4]],
            designated_assist:  buf[5]==0xff?"Display":buf[5],
            speed_limit:        buf[6]==0xff?"Display":buf[6],
            start_current:      buf[7],
        };
    }
    makeBasData(data) {
        return [
            // TODO
        ];
    }
    makePasData(data) {
        return [
            // TODO
        ];
    }
    makeThrData(data) {
        return [
            data["start_voltage"],
            data["end_voltage"],
            data["mode"]=="Speed"?0:1,
            data["designated_assist"]=="Display"?0xff:data["designated_assist"],
            data["speed_limit"]=="Display"?0xff:data["speed_limit"],
            data["start_current"],
        ];
    }
    prepareWriteData(blk, buf) {
        let data = [CMD_WRITE, blk, buf.length];
        data = data.concat(buf);
        this.addVerification(data);
        console.log("Prepare to write:",data);
        return data;
    }
    async writeBlock(blk) {
        let data = null;
        let key = blockKeys[blk];
        switch(blk) {
            case BLK_BAS:
            data = this.makeBasData(this.data[key]);
            break;
            case BLK_PAS:
            data = this.makePasData(this.data[key]);
            break;
            case BLK_THR:
            data = this.makeThrData(this.data[key]);
            break;
        }
        data = this.prepareWriteData(blk, data);
        //this.expectBytes(2);
        //this.expectMode = CMD_WRITE; // so that listen() can know if it's data or result code?
        //return this.write(data);
    }

    async listen() {
        const reader = this.reader;

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                reader.releaseLock();
                console.log("DONE");
                break;
            }
            console.log("read "+value);

            // DUMMY TEST WITH LOOP BACK DEVICE
            if(this.byteCount > 0 && this.buffer) {
                this.byteCount = 0;
                // GEN
                this.buffer = [0x51,0x10,0x48,0x5A,0x58,0x54,0x53,0x5A,0x5A,0x36,0x32,0x32,0x32,0x30,0x31,0x31,0x01,0x14,0x1B];
                // BAS
                // this.buffer = [0x52, 0x18, 0x1F, 0x0F, 0x00, 0x1C, 0x25, 0x2E, 0x37, 0x40, 0x49, 0x52, 0x5B, 0x64, 0x64, 0x64, 0x64, 0x64, 0x64, 0x64, 0x64, 0x64, 0x64, 0x64, 0x37, 0x01, 0xDF];
                // PAS
                //this.buffer = [0x53, 0x0B, 0x03, 0xFF, 0xFF, 0x64, 0x06, 0x14, 0x0A, 0x19, 0x08, 0x14, 0x14, 0x27];
                // THR
                // this.buffer = [0x54, 0x06, 0x0B, 0x23, 0x00, 0x03, 0x11, 0x14, 0xAC];
                this.processReadResponse(this.buffer);
            }
            /* THE REAL THING
            for (const a of value) {    
                if(this.byteCount > 0 && this.buffer) {
                    this.byteCount--;
                    console.log("pushing 0x"+a.toString(16)+", "+this.byteCount+" bytes left");
                    this.buffer.push(a);
                    if(this.byteCount == 0) {
                        console.log("Got all "+this.buffer.length+" bytes");
                        this.processReadResponse(this.buffer);
                        // TODO: Similar for write, but then second byte is result code.
                        // so we need a flag to tell if we need processReadResponse or processWriteResponse.
                    }
                } else {
                    console.log("ignoring byte: 0x"+a.toString(16));
                }
            }
            */
        }
    }
    logError(...msg) {
        const node = document.getElementById('error-display');
        node.style.color = "red";
        node.innerText = msg.join('\n');
    }
    logMsg(...msg) {
        const node = document.getElementById('error-display');
        node.style.color = "green";
        node.innerText = msg.join('\n');
    }
    async init() {
        if ('serial' in navigator) {
            try {
                const port = await navigator.serial.requestPort();
                console.log(port);
                await port.open({ baudRate: BAUD_RATE });
                this.reader = port.readable.getReader();
                this.writer = port.writable.getWriter();
                /*let signals = await port.getSignals();*/

                this.listen();
                this.onSerialConnect(port);
            }
            catch (err) {
                console.log(err);
                if(err.name != "NotFoundError")
                    this.logError('Could not open serial port:', err);
            }
        }
        else {
            console.error('Web serial doesn\'t seem to be enabled in your browser. Try enabling it by visiting:');
            console.error('chrome://flags/#enable-experimental-web-platform-features');
            console.error('opera://flags/#enable-experimental-web-platform-features');
            console.error('edge://flags/#enable-experimental-web-platform-features');
        }
    }
    async write(data) {
        return await this.writer.write(Uint8Array.from(data));
    }
    verificationByte(data) {
        let x = data.slice(1).reduce((tot,val) => {
            return tot + val;
        });
        return (x % 256);
    }
    addVerification(data) {
        data.push(this.verificationByte(data));
    }
    expectBytes(len) {
        console.log("expecting "+len+" bytes...");
        this.logMsg("Waiting for response...");
        if(this.byteCount > 0)
            this.logError("Warning: Previous read not finished");
        this.byteCount = len;
        this.buffer = new Array();
    }
    async connectDevice() {
        let data = [CMD_READ, BLK_GEN, 4, 0xb0];
        this.addVerification(data);
        // console.log(data);
        this.expectBytes(blockNumBytes[BLK_GEN]);
        // await new Promise(r => setTimeout(r, 3000)); // test
        return this.write(data);
    }
    async readBlock(blk) {
        let data = [CMD_READ, blk];
        this.expectBytes(blockNumBytes[blk]);
        return this.write(data);
    }
}
