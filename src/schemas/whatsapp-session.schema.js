"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppSessionSchema = exports.WhatsAppSession = exports.SessionStatus = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
var SessionStatus;
(function (SessionStatus) {
    SessionStatus["DISCONNECTED"] = "disconnected";
    SessionStatus["CONNECTING"] = "connecting";
    SessionStatus["QR_REQUIRED"] = "qr_required";
    SessionStatus["AUTHENTICATED"] = "authenticated";
    SessionStatus["READY"] = "ready";
    SessionStatus["FAILED"] = "failed";
})(SessionStatus || (exports.SessionStatus = SessionStatus = {}));
let WhatsAppSession = class WhatsAppSession {
};
exports.WhatsAppSession = WhatsAppSession;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, auto: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], WhatsAppSession.prototype, "_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "sessionId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "authClientId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: "User" }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], WhatsAppSession.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: "Entity", required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], WhatsAppSession.prototype, "entityId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [mongoose_2.Types.ObjectId], default: [] }),
    __metadata("design:type", Array)
], WhatsAppSession.prototype, "entityIdPath", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: "Entity", required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], WhatsAppSession.prototype, "tenantId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "phoneNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "whatsappName", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "whatsappId", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        required: true,
        enum: SessionStatus,
        default: SessionStatus.DISCONNECTED,
    }),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "qrCode", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "qrCodeUrl", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "qrCodeGeneratedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "qrCodeExpiresAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "connectedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "disconnectedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "lastActivityAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "connectionOwner", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "connectionOwnerExpiresAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "connectionOwnerHeartbeatAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], WhatsAppSession.prototype, "reconnectAttempts", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String }),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "sessionData", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], WhatsAppSession.prototype, "messagesSent", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], WhatsAppSession.prototype, "messagesReceived", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], WhatsAppSession.prototype, "messagesDelivered", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], WhatsAppSession.prototype, "messagesFailed", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], WhatsAppSession.prototype, "settings", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], WhatsAppSession.prototype, "isActive", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], WhatsAppSession.prototype, "autoReconnect", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "lastError", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "lastErrorAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "lastHealthStatus", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "lastHealthCheckAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "nextHealthCheckAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], WhatsAppSession.prototype, "consecutiveHealthFailures", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "lastHealthError", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "lastHealthAlertAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "createdBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "updatedBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "createdAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], WhatsAppSession.prototype, "updatedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        required: false,
    }),
    __metadata("design:type", String)
], WhatsAppSession.prototype, "failureReason", void 0);
exports.WhatsAppSession = WhatsAppSession = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], WhatsAppSession);
exports.WhatsAppSessionSchema = mongoose_1.SchemaFactory.createForClass(WhatsAppSession);
exports.WhatsAppSessionSchema.index({ sessionId: 1 }, { unique: true });
exports.WhatsAppSessionSchema.index({ userId: 1 });
exports.WhatsAppSessionSchema.index({ entityId: 1 });
exports.WhatsAppSessionSchema.index({ entityIdPath: 1 });
exports.WhatsAppSessionSchema.index({ tenantId: 1, isActive: 1 });
exports.WhatsAppSessionSchema.index({ status: 1 });
exports.WhatsAppSessionSchema.index({ phoneNumber: 1 });
exports.WhatsAppSessionSchema.pre(["updateOne", "findOneAndUpdate"], function (next) {
    const update = this.getUpdate() || {};
    const $set = update.$set || (update.$set = {});
    if ($set.status === "failed" && !$set.failedAt) {
        $set.failedAt = new Date();
    }
    this.setUpdate(update);
    next();
});
//# sourceMappingURL=whatsapp-session.schema.js.map