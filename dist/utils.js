"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringify = exports.blobToBase64 = void 0;
const snake_case_1 = require("snake-case");
const blobToBase64 = (blob) => {
    return new Promise((resolve, _) => {
        const reader = new FileReader();
        reader.onloadend = () => { var _a; return resolve(((_a = reader.result) === null || _a === void 0 ? void 0 : _a.toString().split(",")[1]) || null); };
        reader.readAsDataURL(blob);
    });
};
exports.blobToBase64 = blobToBase64;
const stringify = (obj) => {
    return JSON.stringify(obj, function (key, value) {
        if (value && typeof value === "object") {
            var replacement = {};
            for (var k in value) {
                if (Object.hasOwnProperty.call(value, k)) {
                    replacement[k && (0, snake_case_1.snakeCase)(k.toString())] = value[k];
                }
            }
            return replacement;
        }
        return value;
    });
};
exports.stringify = stringify;
