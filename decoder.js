// ============================================================
// 日K数据解码器 — 移植自 qttest 仓库 lib/util.js (decodeBase64DayKData)
// 机制: 新浪 hisdata_klc2/klc_kl.js 返回 base64 压缩日K, 此函数解密
// ============================================================
class Util {
    // 加载新浪加密日K脚本并解码为 [{date, open, high, low, close, volume, amount}]
    static async loadDayKList(fullCode) {
        await Util.loadScript(`https://finance.sina.com.cn/realstock/company/${fullCode}/hisdata_klc2/klc_kl.js`);
        const orgData = window[`KLC_K2_${fullCode}`];
        if (!orgData) throw new Error('日K数据加载失败: ' + fullCode);
        return Util.decodeBase64DayKData(orgData);
    }

    // 前复权(移植自新浪个股页 K线组件机制):
    // 新浪的加密日K数据在除权除息日的行内嵌 prevclose(除权基准价),
    // 前端用因子 = prevclose / 前一交易日close, 对除权日之前的所有K线价格累乘,
    // 得到以最新价格为基准的前复权序列, 消除除权跳变。
    static applyQfq(kList) {
        // 1. 找出每个除权日及其缩放因子
        const factorByIdx = new Map();
        for (let i = kList.length - 1; i >= 1; i--) {
            const k = kList[i];
            if (k.prevclose !== undefined && kList[i - 1].close > 0) {
                const f = k.prevclose / kList[i - 1].close;
                if (isFinite(f) && f > 0 && Math.abs(f - 1) > 1e-6) factorByIdx.set(i, f);
            }
        }
        // 2. 从最晚往最早走, cum = 当前日期之后所有除权因子之积, 乘到该日价格上
        //    (因子作用于除权日"之前"的历史, 除权日本身按除权后价格, 不乘)
        const out = kList.map(k => ({ ...k, prevclose: undefined }));
        let cum = 1;
        for (let i = out.length - 1; i >= 0; i--) {
            const k = out[i];
            if (cum !== 1) {
                k.open = +(k.open * cum).toFixed(3);
                k.high = +(k.high * cum).toFixed(3);
                k.low = +(k.low * cum).toFixed(3);
                k.close = +(k.close * cum).toFixed(3);
            }
            const f = factorByIdx.get(i);
            if (f !== undefined) cum *= f;
        }
        return out;
    }

    static loadScript(url, removeAfterLoad = true) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => {
                resolve(url);
                if (removeAfterLoad) document.head.removeChild(script);
            };
            script.onerror = () => {
                reject(new Error('脚本加载失败: ' + url));
                if (removeAfterLoad && script.parentNode) document.head.removeChild(script);
            };
            document.head.appendChild(script);
        });
    }

    static decodeBase64DayKData(orgData) {
        function next() {
            var i;
            var propertyNames;
            /** @type {number} */
            i = 0;
            for (; i < 64; i++) {
                /** @type {number} */
                safe[i] = Math.pow(2, i);
                if (i < 26) {
                    /** @type {string} */
                    ret[i] = String.fromCharCode(i + 65);
                    /** @type {string} */
                    ret[i + 26] = String.fromCharCode(i + 97);
                    if (i < 10) {
                        /** @type {string} */
                        ret[i + 52] = String.fromCharCode(i + 48);
                    }
                }
            }
            ret.push("+", "/");
            ret = ret.join("");
            data = orgData.split("");
            len = data.length;
            /** @type {number} */
            i = 0;
            for (; i < len; i++) {
                data[i] = ret.indexOf(data[i]);
            }
            p = {};
            /** @type {number} */
            offset = dist = 0;
            _c = {};
            propertyNames = check([12, 6]);
            /** @type {number} */
            da = 63 ^ propertyNames[1];
            return {
                /** @type {function (): ?} */
                _1479: process,
                /** @type {function (): ?} */
                _136: write,
                /** @type {function (): ?} */
                _200: clear,
                /** @type {function (): ?} */
                _139: set,
                /** @type {function (): ?} */
                _197: end,
                /** @type {function (): ?} */
                _3466: init
            }["_" + propertyNames[0]] || function () {
                return [];
            };
        }
        /**
         * @param {?} vec0
         * @return {?}
         */
        function add(vec0) {
            return vec0 === {}._;
        }
        /**
         * @return {?}
         */
        function remove() {
            var result;
            var d;
            result = fn();
            /** @type {number} */
            d = 1;
            for (; ;) {
                if (fn()) {
                    d++;
                } else {
                    return d * (result * 2 - 1);
                }
            }
        }
        /**
         * @return {?}
         */
        function fn() {
            var d;
            if (offset >= len) {
                return 0;
            }
            /** @type {number} */
            d = data[offset] & 1 << dist;
            dist++;
            if (dist >= 6) {
                dist -= 6;
                offset++;
            }
            return !!d;
        }
        /**
         * @param {Array} opt_attributes
         * @param {Array} recurring
         * @param {Array} properties
         * @return {?}
         */
        function check(opt_attributes, recurring, properties) {
            var i;
            var qs;
            var val;
            var b;
            var a;
            /** @type {Array} */
            qs = [];
            /** @type {number} */
            val = 0;
            if (!recurring) {
                /** @type {Array} */
                recurring = [];
            }
            if (!properties) {
                /** @type {Array} */
                properties = [];
            }
            /** @type {number} */
            i = 0;
            for (; i < opt_attributes.length; i++) {
                b = opt_attributes[i];
                /** @type {number} */
                val = 0;
                if (!b) {
                    /** @type {number} */
                    qs[i] = 0;
                    continue;
                }
                if (offset >= len) {
                    return qs;
                }
                if (opt_attributes[i] <= 0) {
                    /** @type {number} */
                    val = 0;
                } else {
                    if (opt_attributes[i] <= 30) {
                        for (; ;) {
                            /** @type {number} */
                            a = 6 - dist;
                            a = a < b ? a : b;
                            val |= (data[offset] >> dist & (1 << a) - 1) << opt_attributes[i] - b;
                            dist += a;
                            if (dist >= 6) {
                                dist -= 6;
                                offset++;
                            }
                            b -= a;
                            if (b <= 0) {
                                break;
                            }
                        }
                        if (recurring[i] && val >= safe[opt_attributes[i] - 1]) {
                            val -= safe[opt_attributes[i]];
                        }
                    } else {
                        val = check([30, opt_attributes[i] - 30], [0, recurring[i]]);
                        if (!properties[i]) {
                            val = val[0] + val[1] * safe[30];
                        }
                    }
                }
                qs[i] = val;
            }
            return qs;
        }
        /**
         * @return {?}
         */
        function find() {
            var results;
            results = check([3])[0];
            if (results == 1) {
                p.d = check([18], [1])[0];
                /** @type {number} */
                results = 0;
            } else {
                if (!results) {
                    results = check([6])[0];
                }
            }
            return results;
        }
        /**
         * @param {number} dataAndEvents
         * @return {?}
         */
        function success(dataAndEvents) {
            var i;
            var ret;
            var d;
            if (dataAndEvents > 1) {
                /** @type {number} */
                i = 0;
            }
            /** @type {number} */
            i = 0;
            for (; i < dataAndEvents; i++) {
                p.d++;
                /** @type {number} */
                d = p.d % 7;
                if (d == 3 || d == 4) {
                    p.d += 5 - d;
                }
            }
            /** @type {Date} */
            ret = new Date;
            ret.setTime((cameraOffsetY + p.d) * scale);
            return ret;
        }
        /**
         * @param {number} num
         * @return {?}
         */
        function clean(num) {
            var i;
            var ret;
            var w;
            w = p.wd || 62;
            /** @type {number} */
            i = 0;
            for (; i < num; i++) {
                do {
                    p.d++;
                } while (!(w & 1 << (p.d % 7 + 10) % 7));
            }
            /** @type {Date} */
            ret = new Date;
            ret.setTime((cameraOffsetY + p.d) * scale);
            return ret;
        }
        /**
         * @param {number} a
         * @return {?}
         */
        function $(a) {
            var c;
            var context;
            var args;
            if (!a) {
                return [0, 0];
            } else {
                if (a < 0) {
                    c = $(-a);
                    return [-c[0], -c[1]];
                }
            }
            /** @type {number} */
            c = a % 3;
            /** @type {number} */
            context = (a - c) / 3;
            /** @type {Array} */
            args = [context, context];
            if (c) {
                args[c - 1]++;
            }
            return args;
        }
        /**
         * @param {string} data
         * @param {number} c
         * @param {number} parent
         * @return {?}
         */
        function make(data, c, parent) {
            var i;
            var ret;
            var obj;
            if (typeof c == "number") {
                ret = $(c);
            } else {
                /** @type {number} */
                ret = c;
            }
            obj = $(parent);
            /** @type {Array} */
            i = [obj[0] - ret[0], obj[1] - ret[1]];
            /** @type {number} */
            ret = 1;
            for (; i[0] < i[1];) {
                ret *= 5;
                i[1]--;
            }
            for (; i[1] < i[0];) {
                ret *= 2;
                i[0]--;
            }
            if (ret > 1) {
                data *= ret;
            }
            i = i[0];
            data = parse(data);
            if (i < 0) {
                for (; data.length + i <= 0;) {
                    /** @type {string} */
                    data = "0" + data;
                }
                i += data.length;
                /** @type {number} */
                ret = data.substr(0, i) - 0;
                if (parent === undefined) {
                    return ret + "." + data.substr(i) - 0;
                }
                /** @type {number} */
                obj = data.charAt(i) - 0;
                if (obj > 5) {
                    ret++;
                } else {
                    if (obj == 5) {
                        if (data.substr(i + 1) - 0 > 0) {
                            ret++;
                        } else {
                            ret += ret & 1;
                        }
                    }
                }
                return ret;
            } else {
                for (; i > 0; i--) {
                    data += "0";
                }
            }
            return data - 0;
        }
        /**
         * @return {?}
         */
        function clear() {
            var i;
            var j;
            var assigns;
            var v;
            var m;
            var vvar;
            if (da >= 1) {
                return [];
            }
            /** @type {number} */
            p.d = check([18], [1])[0] - 1;
            v = check([3, 3, 30, 6]);
            p.p = v[0];
            p.ld = v[1];
            p.cd = v[2];
            p.c = v[3];
            /** @type {number} */
            p.m = Math.pow(10, p.p);
            /** @type {number} */
            p.pc = p.cd / p.m;
            /** @type {Array} */
            assigns = [];
            /** @type {number} */
            i = 0;
            for (; ; i++) {
                m = {
                    d: 1
                };
                if (fn()) {
                    v = check([3])[0];
                    if (v == 0) {
                        m.d = check([6])[0];
                    } else {
                        if (v == 1) {
                            p.d = check([18])[0];
                            /** @type {number} */
                            m.d = 0;
                        } else {
                            m.d = v;
                        }
                    }
                }
                vvar = {
                    date: success(m.d)
                };
                if (fn()) {
                    p.ld += remove();
                }
                v = check([p.ld * 3], [1]);
                p.cd += v[0];
                /** @type {number} */
                vvar.close = p.cd / p.m;
                assigns.push(vvar);
                if (offset >= len || offset == len - 1 && !((p.c ^ i + 1) & 63)) {
                    break;
                }
            }
            /** @type {number} */
            assigns[0].prevclose = p.pc;
            return assigns;
        }
        /**
         * @return {?}
         */
        function write() {
            var prop;
            var i;
            var val;
            var obj;
            var res;
            var v;
            var result;
            var data;
            var test;
            var length;
            var name;
            if (da > 2) {
                return [];
            }
            /** @type {Array} */
            result = [];
            test = {
                v: "volume",
                p: "price",
                a: "avg_price"
            };
            /** @type {number} */
            p.d = check([18], [1])[0] - 1;
            data = {
                date: success(1)
            };
            val = check(da < 1 ? [3, 3, 4, 1, 1, 1, 5] : [4, 4, 4, 1, 1, 1, 3]);
            /** @type {number} */
            prop = 0;
            for (; prop < 7; prop++) {
                p[["la", "lp", "lv", "tv", "rv", "zv", "pp"][prop]] = val[prop];
            }
            /** @type {number} */
            p.m = Math.pow(10, p.pp);
            if (da >= 1) {
                val = check([3, 3]);
                p.c = val[0];
                val = val[1];
            } else {
                /** @type {number} */
                val = 5;
                /** @type {number} */
                p.c = 2;
            }
            p.pc = check([val * 6])[0];
            /** @type {number} */
            data.pc = p.pc / p.m;
            p.cp = p.pc;
            /** @type {number} */
            p.da = 0;
            /** @type {number} */
            p.sa = p.sv = 0;
            /** @type {number} */
            prop = 0;
            for (; ; prop++) {
                if (offset >= len || offset == len - 1 && !((p.c ^ prop) & 7)) {
                    break;
                }
                res = {};
                obj = {};
                length = p.tv ? fn() : 1;
                /** @type {number} */
                i = 0;
                for (; i < 3; i++) {
                    name = ["v", "p", "a"][i];
                    if (length ? fn() : 0) {
                        val = remove();
                        p["l" + name] += val;
                    }
                    v = name == "v" && p.rv ? fn() : 1;
                    /** @type {number} */
                    val = check([p["l" + name] * 3 + (name == "v" ? v * 7 : 0)], [!!i])[0] * (v ? 1 : 100);
                    /** @type {number} */
                    obj[name] = val;
                    if (name == "v") {
                        if (!(res[test[name]] = val) && ((da > 1 || prop < 241) && (p.zv ? !fn() : 1))) {
                            /** @type {number} */
                            obj["p"] = 0;
                            break;
                        }
                    } else {
                        if (name == "a") {
                            p.da = (da < 1 ? 0 : p.da) + obj["a"];
                        }
                    }
                }
                p.sv += obj["v"];
                /** @type {number} */
                res[test["p"]] = (p.cp += obj["p"]) / p.m;
                p.sa += obj["v"] * p.cp;
                res[test["a"]] = add(obj["a"]) ? prop ? result[prop - 1][test["a"]] : res[test["p"]] : p.sv ? ((Math.floor((p.sa * (2E3 / p.m) + p.sv) / p.sv) >> 1) + p.da) / 1E3 : res[test["p"]] + p.da / 1E3;
                result.push(res);
            }
            result[0].date = data.date;
            /** @type {number} */
            result[0].prevclose = data.pc;
            return result;
        }
        /**
         * @return {?}
         */
        function process() {
            var ret;
            var index;
            var local;
            var obj;
            var v;
            var val;
            var i;
            var a;
            if (da >= 1) {
                return [];
            }
            /** @type {number} */
            p.lastVolume = 0;
            /** @type {number} */
            p.lastDate = 0;
            /** @type {number} */
            p.currentDate = 0;
            /** @type {Array} */
            p.currentVolume = [0, 0];
            p.precision = check([6])[0];
            /** @type {number} */
            p.date = check([18], [1])[0] - 1;
            /** @type {number} */
            p.multiplier = Math.pow(10, p.precision);
            val = check([3, 3]);
            p.baseDate = val[0];
            p.baseVolume = val[1];
            /** @type {Array} */
            ret = [];
            for (; ;) {
                val = check([6]);
                if (!val.length) {
                    break;
                }
                obj = {
                    code: val[0]
                };
                v = {};
                /** @type {number} */
                obj.dateIncrement = 1;
                if (obj.code & 32) {
                    for (; ;) {
                        val = check([6])[0];
                        if ((val | 16) == 63) {
                            /** @type {string} */
                            a = val & 16 ? "x" : "u";
                            val = check([3, 3]);
                            obj[a + "_date"] = val[0] + p.baseDate;
                            obj[a + "_volume"] = val[1] + p.baseVolume;
                            break;
                        } else {
                            if (val & 32) {
                                /** @type {string} */
                                i = val & 8 ? "date" : "volume";
                                /** @type {string} */
                                a = val & 16 ? "x" : "u";
                                obj[a + "_" + i] = (val & 7) + p["multiplier" + i];
                                break;
                            } else {
                                /** @type {number} */
                                i = val & 15;
                                if (i == 0) {
                                    obj.dateIncrement = check([6])[0];
                                } else {
                                    if (i == 1) {
                                        p.date = i = check([18])[0];
                                        /** @type {number} */
                                        obj.dateIncrement = 0;
                                    } else {
                                        /** @type {number} */
                                        obj.dateIncrement = i;
                                    }
                                }
                                if (!(val & 16)) {
                                    break;
                                }
                            }
                        }
                    }
                }
                v.date = success(obj.dateIncrement);
                for (i in {
                    volume: 0,
                    date: 0
                }) {
                    if (!add(obj["x_" + i])) {
                        p["last" + i] = obj["x_" + i];
                    }
                    if (add(obj["u_" + i])) {
                        obj["u_" + i] = p["last" + i];
                    }
                }
                /** @type {Array} */
                obj.levelList = [obj.u_date, obj.u_date, obj.u_date, obj.u_date, obj.u_volume];
                a = radpower[obj.code & 15];
                if (obj.u_volume & 1) {
                    /** @type {number} */
                    a = 31 - a;
                }
                if (obj.code & 16) {
                    obj.levelList[4] += 2;
                }
                /** @type {number} */
                local = 0;
                for (; local < 5; local++) {
                    if (a & 1 << 4 - local) {
                        obj.levelList[local]++;
                    }
                    obj.levelList[local] *= 3;
                }
                obj.dateVolume = check(obj.levelList, [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]);
                i = p.currentDate + obj.dateVolume[0];
                /** @type {number} */
                v.open = i / p.multiplier;
                /** @type {number} */
                v.high = (i + obj.dateVolume[1]) / p.multiplier;
                /** @type {number} */
                v.low = (i - obj.dateVolume[2]) / p.multiplier;
                /** @type {number} */
                v.close = (i + obj.dateVolume[3]) / p.multiplier;
                val = obj.dateVolume[4];
                if (typeof val == "number") {
                    /** @type {Array} */
                    val = [val, val >= 0 ? 0 : -1];
                }
                p.currentDate = i + obj.dateVolume[3];
                a = p.currentVolume[0] + val[0];
                /** @type {Array} */
                p.currentVolume = [a & b, p.currentVolume[1] + val[1] + !!((p.currentVolume[0] & b) + (val[0] & b) & CUTBIT)];
                /** @type {number} */
                v.volume = (p.currentVolume[0] & CUTBIT - 1) + p.currentVolume[1] * CUTBIT;
                ret.push(v);
            }
            return ret;
        }
        /**
         * @return {?}
         */
        function set() {
            var out;
            var copies;
            var miny;
            var count;
            if (da > 1) {
                return [];
            }
            /** @type {number} */
            p.l = 0;
            /** @type {number} */
            count = -1;
            /** @type {number} */
            p.d = check([18])[0] - 1;
            miny = check([18])[0];
            for (; p.d < miny;) {
                copies = success(1);
                if (count <= 0) {
                    if (fn()) {
                        p.l += remove();
                    }
                    count = check([p.l * 3], [0])[0] + 1;
                    if (!out) {
                        /** @type {Array} */
                        out = [copies];
                        count--;
                    }
                } else {
                    out.push(copies);
                }
                count--;
            }
            return out;
        }
        /**
         * @return {?}
         */
        function end() {
            var k;
            var i;
            var result;
            var v;
            var contact;
            var x;
            if (da >= 1) {
                return [];
            }
            p.f = check([6])[0];
            p.c = check([6])[0];
            /** @type {Array} */
            result = [];
            /** @type {Array} */
            p.dv = [];
            /** @type {Array} */
            p.dl = [];
            /** @type {number} */
            k = 0;
            for (; k < p.f; k++) {
                /** @type {number} */
                p.dv[k] = 0;
                /** @type {number} */
                p.dl[k] = 0;
            }
            /** @type {number} */
            k = 0;
            for (; ; k++) {
                if (offset >= len || offset == len - 1 && !((p.c ^ k) & 7)) {
                    break;
                }
                /** @type {Array} */
                contact = [];
                /** @type {number} */
                i = 0;
                for (; i < p.f; i++) {
                    if (fn()) {
                        p.dl[i] += remove();
                    }
                    p.dv[i] += check([p.dl[i] * 3], [1])[0];
                    contact[i] = p.dv[i];
                }
                result.push(contact);
            }
            return result;
        }
        /**
         * @return {?}
         */
        function init() {
            p = {
                b_avp: 1,
                b_ph: 0,
                b_phx: 0,
                b_sep: 0,
                p_p: 6,
                p_v: 0,
                p_a: 0,
                p_e: 0,
                p_t: 0,
                l_o: 3,
                l_h: 3,
                l_l: 3,
                l_c: 3,
                l_v: 5,
                l_a: 5,
                l_e: 3,
                l_t: 0,
                u_p: 0,
                u_v: 0,
                u_a: 0,
                wd: 62,
                d: 0
            };
            if (da > 0) {
                return [];
            }
            var ret;
            var v;
            var o;
            var c;
            var name;
            var index;
            var i;
            /** @type {Array} */
            ret = [];
            for (; ;) {
                if (offset >= len) {
                    return undefined;
                }
                o = {
                    d: 1,
                    c: 0
                };
                if (fn()) {
                    if (fn()) {
                        if (fn()) {
                            o.c++;
                            /** @type {number} */
                            o.a = p.b_avp;
                            if (fn()) {
                                p.b_avp ^= fn();
                                p.b_ph ^= fn();
                                p.b_phx ^= fn();
                                /** @type {number} */
                                o.s = p.b_sep;
                                p.b_sep ^= fn();
                                if (fn()) {
                                    p.wd = check([7])[0];
                                }
                                if (o.s ^ p.b_sep) {
                                    if (o.s) {
                                        p.u_p = p.u_c;
                                    } else {
                                        p.u_o = p.u_h = p.u_l = p.u_c = p.u_p;
                                    }
                                }
                            }
                            /** @type {number} */
                            index = 0;
                            for (; index < 3 + p.b_ph * 2; index++) {
                                if (fn()) {
                                    /** @type {string} */
                                    name = "pvaet".charAt(index);
                                    c = p["p_" + name];
                                    p["p_" + name] += remove();
                                    /** @type {number} */
                                    p["u_" + name] = make(p["u_" + name], c, p["p_" + name]) - 0;
                                    if (p.b_sep && !index) {
                                        /** @type {number} */
                                        i = 0;
                                        for (; i < 4; i++) {
                                            /** @type {string} */
                                            name = "ohlc".charAt(i);
                                            /** @type {number} */
                                            p["u_" + name] = make(p["u_" + name], c, p.p_p) - 0;
                                        }
                                    }
                                }
                            }
                            if (!p.b_avp && o.a) {
                                p.u_a = make(v && v.amount || 0, 0, p.p_a);
                            }
                        }
                        if (fn()) {
                            o.c++;
                            /** @type {number} */
                            index = 0;
                            for (; index < 7 + p.b_ph + p.b_phx; index++) {
                                if (fn()) {
                                    if (index == 6) {
                                        o.d = find();
                                    } else {
                                        p["l_" + "ohlcva*et".charAt(index)] += remove();
                                    }
                                }
                            }
                        }
                        if (fn()) {
                            o.c++;
                            name = p.l_o + (fn() && remove());
                            c = check([name * 3], [1])[0];
                            o.p = p.b_sep ? p.u_c + c : p.u_p += c;
                        }
                        if (!o.c) {
                            break;
                        }
                    } else {
                        if (fn()) {
                            if (fn()) {
                                if (fn()) {
                                    o.d = find();
                                } else {
                                    p.l_v += remove();
                                }
                            } else {
                                if (p.b_ph && fn()) {
                                    p["l_" + "et".charAt(p.b_phx && fn())] += remove();
                                } else {
                                    p.l_a += remove();
                                }
                            }
                        } else {
                            p["l_" + "ohlc".charAt(check([2])[0])] += remove();
                        }
                    }
                }
                /** @type {number} */
                index = 0;
                for (; index < 6 + p.b_ph + p.b_phx; index++) {
                    /** @type {string} */
                    i = "ohlcvaet".charAt(index);
                    /** @type {number} */
                    c = (p.b_sep ? 191 : 185) >> index & 1;
                    o["v_" + i] = check([p["l_" + i] * 3], [c])[0];
                }
                v = {
                    date: clean(o.d)
                };
                if (o.p) {
                    v.prevclose = make(o.p, p.p_p);
                }
                if (p.b_sep) {
                    v.open = make(p.u_o += o.v_o, p.p_p);
                    v.high = make(p.u_h += o.v_h, p.p_p);
                    v.low = make(p.u_l += o.v_l, p.p_p);
                    v.close = make(p.u_c += o.v_c, p.p_p);
                } else {
                    o.o = p.u_p + o.v_o;
                    v.open = make(o.o, p.p_p);
                    v.high = make(o.o + o.v_h, p.p_p);
                    v.low = make(o.o - o.v_l, p.p_p);
                    v.close = make(p.u_p = o.o + o.v_c, p.p_p);
                }
                v.volume = make(p.u_v += o.v_v, p.p_v);
                if (p.b_avp) {
                    c = $(p.p_p);
                    name = $(p.p_v);
                    v.amount = make(make(Math.floor((p.b_sep ? (p.u_o + p.u_h + p.u_l + p.u_c) / 4 : o.o + (o.v_h - o.v_l + o.v_c) / 4) * p.u_v + 0.5), [c[0] + name[0], c[1] + name[1]], p.p_a) + o.v_a, p.p_a);
                } else {
                    p.u_a += o.v_a;
                    v.amount = make(p.u_a, p.p_a);
                }
                if (p.b_ph) {
                    v.postVol = make(o.v_e, p.p_e);
                    v.postAmt = make(Math.floor(v.postVol * v.close + (p.b_phx ? make(o.v_t, p.p_t) : 0) + 0.5), 0);
                }
                ret.push(v);
            }
            return ret;
        }
        /**
         * @param {number} str
         * @return {?}
         */
        function parse(str) {
            var precision;
            var start;
            var tagNameArr;
            str = (str || 0).toString();
            /** @type {Array} */
            tagNameArr = [];
            start = str.toLowerCase().indexOf("e");
            if (start > 0) {
                /** @type {number} */
                precision = str.substr(start + 1) - 0;
                for (; precision >= 0; precision--) {
                    tagNameArr.push(Math.floor(precision * Math.pow(10, -precision) + 0.5) - 0);
                }
                return tagNameArr.join("");
            } else {
                return str;
            }
        }
        var offset;
        var data;
        var len;
        var p;
        var _c;
        var dist;
        var da;
        /** @type {number} */
        var scale = 864E5;
        /** @type {number} */
        var cameraOffsetY = 7657;
        /** @type {Array} */
        var ret = [];
        /** @type {Array} */
        var safe = [];
        /** @type {number} */
        var b = ~(3 << 30);
        /** @type {number} */
        var CUTBIT = 1 << 30;
        /** @type {Array} */
        var radpower = [0, 3, 5, 6, 9, 10, 12, 15, 17, 18, 20, 23, 24, 27, 29, 30];
        return next()();

    }
}
