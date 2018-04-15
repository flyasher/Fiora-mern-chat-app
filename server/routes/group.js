const assert = require('assert');

// const User = require('../models/user');
const Group = require('../models/group');
const Socket = require('../models/socket');

module.exports = {
    async createGroup(ctx) {
        const { name } = ctx.data;
        assert(name, '群组名不能为空');

        const group = await Group.findOne({ name });
        assert(!group, '该群组已存在');

        let newGroup = null;
        try {
            newGroup = await Group.create({
                name,
                creator: ctx.socket.user,
                members: [ctx.socket.user],
            });
        } catch (err) {
            if (err.message === 'Group validation failed') {
                return '群组名包含不支持的字符或者长度超过限制';
            }
            throw err;
        }

        ctx.socket.socket.join(newGroup._id);
        return {
            _id: newGroup._id,
            name: newGroup.name,
            avatar: newGroup.avatar,
            createTime: newGroup.createTime,
            messages: [],
        };
    },
    async getGroupOnlineMembers(ctx) {
        const { groupId } = ctx.data;

        const group = await Group.findOne({ _id: groupId });
        assert(group, '群组不存在');

        const sockets = await Socket
            .find(
                { user: group.members },
                { os: 1, browser: 1, environment: 1, user: 1 },
            )
            .populate(
                'user',
                { username: 1, avatar: 1 },
            );
        const filterSockets = sockets.reduce((result, socket) => {
            result[socket.user] = socket;
            return result;
        }, {});
        return Object.values(filterSockets);
    },
    async changeGroupAvatar(ctx) {
        const { groupId, avatar } = ctx.data;
        assert(avatar, '头像地址不能为空');

        await Group.update({ _id: groupId }, { avatar });
        return {};
    },
};
