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
exports.UserSchema = exports.User = exports.QRInvitationHistory = exports.UserPreferences = exports.WhatsAppConnectionStatus = exports.RegistrationStatus = exports.UserRole = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
var UserRole;
(function (UserRole) {
    UserRole["SYSTEM_ADMIN"] = "SystemAdmin";
    UserRole["TENANT_ADMIN"] = "TenantAdmin";
    UserRole["USER"] = "User";
})(UserRole || (exports.UserRole = UserRole = {}));
var RegistrationStatus;
(function (RegistrationStatus) {
    RegistrationStatus["PENDING"] = "pending";
    RegistrationStatus["INVITED"] = "invited";
    RegistrationStatus["REGISTERED"] = "registered";
    RegistrationStatus["CANCELLED"] = "cancelled";
})(RegistrationStatus || (exports.RegistrationStatus = RegistrationStatus = {}));
var WhatsAppConnectionStatus;
(function (WhatsAppConnectionStatus) {
    WhatsAppConnectionStatus["DISCONNECTED"] = "disconnected";
    WhatsAppConnectionStatus["CONNECTING"] = "connecting";
    WhatsAppConnectionStatus["CONNECTED"] = "connected";
    WhatsAppConnectionStatus["FAILED"] = "failed";
})(WhatsAppConnectionStatus || (exports.WhatsAppConnectionStatus = WhatsAppConnectionStatus = {}));
let UserPreferences = class UserPreferences {
};
exports.UserPreferences = UserPreferences;
__decorate([
    (0, mongoose_1.Prop)({ default: "en" }),
    __metadata("design:type", String)
], UserPreferences.prototype, "language", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "UTC" }),
    __metadata("design:type", String)
], UserPreferences.prototype, "timezone", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], UserPreferences.prototype, "emailNotifications", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], UserPreferences.prototype, "whatsappNotifications", void 0);
exports.UserPreferences = UserPreferences = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], UserPreferences);
let QRInvitationHistory = class QRInvitationHistory {
};
exports.QRInvitationHistory = QRInvitationHistory;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], QRInvitationHistory.prototype, "qrCodeId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Date)
], QRInvitationHistory.prototype, "sentAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 1 }),
    __metadata("design:type", Number)
], QRInvitationHistory.prototype, "attemptCount", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], QRInvitationHistory.prototype, "scannedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], QRInvitationHistory.prototype, "expiredAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], QRInvitationHistory.prototype, "isExpired", void 0);
exports.QRInvitationHistory = QRInvitationHistory = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], QRInvitationHistory);
let User = class User {
};
exports.User = User;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, auto: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], User.prototype, "_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false, sparse: true }),
    __metadata("design:type", String)
], User.prototype, "phoneNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], User.prototype, "firstName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], User.prototype, "lastName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], User.prototype, "password", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        required: true,
        enum: RegistrationStatus,
        default: RegistrationStatus.PENDING,
    }),
    __metadata("design:type", String)
], User.prototype, "registrationStatus", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: UserRole, default: UserRole.USER }),
    __metadata("design:type", String)
], User.prototype, "role", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, required: false }),
    __metadata("design:type", Object)
], User.prototype, "entity", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: "Entity", required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], User.prototype, "entityId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], User.prototype, "entityPath", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [mongoose_2.Types.ObjectId], ref: "Entity", default: [] }),
    __metadata("design:type", Array)
], User.prototype, "entityIdPath", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: "Entity", required: false }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], User.prototype, "tenantId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: "Entity" }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], User.prototype, "companyId", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        enum: WhatsAppConnectionStatus,
        default: WhatsAppConnectionStatus.DISCONNECTED,
    }),
    __metadata("design:type", String)
], User.prototype, "whatsappConnectionStatus", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], User.prototype, "whatsappConnectedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [QRInvitationHistory], default: [] }),
    __metadata("design:type", Array)
], User.prototype, "qrInvitationHistory", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: UserPreferences, default: () => new UserPreferences() }),
    __metadata("design:type", UserPreferences)
], User.prototype, "preferences", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "avatar", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "initials", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "isOnline", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], User.prototype, "lastSeenAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: true }),
    __metadata("design:type", Boolean)
], User.prototype, "isActive", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "createdBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "updatedBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "deletedBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], User.prototype, "deletedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], User.prototype, "anonymizedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "pseudonym", void 0);
__decorate([
    (0, mongoose_1.Prop)({ select: false }),
    __metadata("design:type", String)
], User.prototype, "resetPasswordToken", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], User.prototype, "resetPasswordExpires", void 0);
__decorate([
    (0, mongoose_1.Prop)({ select: false }),
    __metadata("design:type", String)
], User.prototype, "emailVerificationToken", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], User.prototype, "emailVerificationExpires", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "emailVerified", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "pendingEmail", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "mustChangePassword", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], User.prototype, "passwordChangedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], User.prototype, "createdAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], User.prototype, "updatedAt", void 0);
exports.User = User = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], User);
exports.UserSchema = mongoose_1.SchemaFactory.createForClass(User);
exports.UserSchema.index({ phoneNumber: 1 }, {
    unique: true,
    partialFilterExpression: {
        phoneNumber: { $type: "string" },
        isActive: true,
    },
});
exports.UserSchema.index({ email: 1, role: 1 }, {
    unique: true,
    partialFilterExpression: { isActive: true },
});
exports.UserSchema.index({ tenantId: 1, isActive: 1 });
exports.UserSchema.index({ entityId: 1 });
exports.UserSchema.index({ companyId: 1 });
exports.UserSchema.index({ entityIdPath: 1 });
exports.UserSchema.index({ registrationStatus: 1, tenantId: 1 });
exports.UserSchema.index({ role: 1, tenantId: 1 });
exports.UserSchema.index({ whatsappConnectionStatus: 1 });
exports.UserSchema.virtual("fullName").get(function () {
    return `${this.firstName} ${this.lastName}`;
});
exports.UserSchema.pre("save", function () {
    if (this.isModified("firstName") || this.isModified("lastName")) {
        this.initials =
            `${this.firstName.charAt(0)}${this.lastName.charAt(0)}`.toUpperCase();
    }
});
exports.UserSchema.set("toJSON", { virtuals: true });
exports.UserSchema.set("toObject", { virtuals: true });
//# sourceMappingURL=user.schema.js.map