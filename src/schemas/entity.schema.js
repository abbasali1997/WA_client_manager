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
exports.EntitySchema = exports.Entity = exports.EntityType = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
var EntityType;
(function (EntityType) {
    EntityType["SYSTEM"] = "system";
    EntityType["ENTITY"] = "entity";
    EntityType["COMPANY"] = "company";
    EntityType["DEPARTMENT"] = "department";
    EntityType["CUSTOM"] = "custom";
})(EntityType || (exports.EntityType = EntityType = {}));
let Entity = class Entity {
};
exports.Entity = Entity;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, auto: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Entity.prototype, "_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Entity.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: EntityType }),
    __metadata("design:type", String)
], Entity.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: "EntityType", default: null }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Entity.prototype, "customEntityTypeId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: "Entity", default: null }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Entity.prototype, "parentId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Entity.prototype, "path", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [mongoose_2.Types.ObjectId], ref: "Entity", default: [] }),
    __metadata("design:type", Array)
], Entity.prototype, "entityIdPath", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: "Entity", default: null }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Entity.prototype, "tenantId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 0 }),
    __metadata("design:type", Number)
], Entity.prototype, "level", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], Entity.prototype, "metadata", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: true }),
    __metadata("design:type", Boolean)
], Entity.prototype, "isActive", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: true }),
    __metadata("design:type", Boolean)
], Entity.prototype, "isExpanded", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Entity.prototype, "createdBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Entity.prototype, "updatedBy", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Entity.prototype, "createdAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Entity.prototype, "updatedAt", void 0);
exports.Entity = Entity = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Entity);
exports.EntitySchema = mongoose_1.SchemaFactory.createForClass(Entity);
exports.EntitySchema.index({ tenantId: 1, isActive: 1 });
exports.EntitySchema.index({ parentId: 1 });
exports.EntitySchema.index({ path: 1 });
exports.EntitySchema.index({ entityIdPath: 1 });
exports.EntitySchema.index({ type: 1, tenantId: 1 });
exports.EntitySchema.index({ level: 1, tenantId: 1 });
exports.EntitySchema.virtual("children", {
    ref: "Entity",
    localField: "_id",
    foreignField: "parentId",
});
exports.EntitySchema.set("toJSON", { virtuals: true });
exports.EntitySchema.set("toObject", { virtuals: true });
//# sourceMappingURL=entity.schema.js.map