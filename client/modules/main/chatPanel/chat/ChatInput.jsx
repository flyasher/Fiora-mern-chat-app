import React, { Component } from 'react';
import autobind from 'autobind-decorator';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import ImmutablePropTypes from 'react-immutable-proptypes';
import * as qiniu from 'qiniu-js';

import action from '@/state/action';
import socket from '@/socket';
import IconButton from '@/components/IconButton';
import Dropdown from '@/components/Dropdown';
import { Menu, MenuItem } from '@/components/Menu';
import Dialog from '@/components/Dialog';
import Message from '@/components/Message';
import Expression from './Expression';
import CodeEditor from './CodeEditor';
import config from '../../../../../config/client';
import readDiskFile from '../../../../../utils/readDiskFile';

const xss = require('../../../../../utils/xss');

class ChatInput extends Component {
    static propTypes = {
        isLogin: PropTypes.bool.isRequired,
        groupId: PropTypes.string,
        user: ImmutablePropTypes.map,
    }
    static handleLogin() {
        action.showLoginDialog();
    }
    static insertAtCursor(input, value) {
        if (document.selection) {
            input.focus();
            const sel = document.selection.createRange();
            sel.text = value;
            sel.select();
        } else if (input.selectionStart || input.selectionStart === '0') {
            const startPos = input.selectionStart;
            const endPos = input.selectionEnd;
            const restoreTop = input.scrollTop;
            input.value = input.value.substring(0, startPos) + value + input.value.substring(endPos, input.value.length);
            if (restoreTop > 0) {
                input.scrollTop = restoreTop;
            }
            input.focus();
            input.selectionStart = startPos + value.length;
            input.selectionEnd = startPos + value.length;
        } else {
            input.value += value;
            input.focus();
        }
    }
    static compressImage(image, mimeType, quality = 1) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            canvas.toBlob(resolve, mimeType, quality);
        });
    }
    constructor(...args) {
        super(...args);
        this.state = {
            expressionVisible: false,
            codeInputVisible: false,
        };
    }
    @autobind
    handleVisibleChange(visible) {
        this.setState({
            expressionVisible: visible,
        });
    }
    @autobind
    handleFeatureMenuClick({ key }) {
        switch (key) {
        case 'image': {
            this.file.click();
            break;
        }
        case 'code': {
            this.setState({
                codeInputVisible: true,
            });
            break;
        }
        default:
        }
    }
    @autobind
    handleCodeEditorClose() {
        this.setState({
            codeInputVisible: false,
        });
    }
    @autobind
    handleSendCode() {
        const language = this.codeEditor.getLanguage();
        const code = `@language=${language}@${this.codeEditor.getValue()}`;
        const id = this.addSelfMessage('code', code);
        this.sendMessage(id, 'code', code);
        this.handleCodeEditorClose();
    }
    @autobind
    handleInputKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            this.sendTextMessage();
        }
    }
    @autobind
    sendTextMessage() {
        const message = this.message.value;
        let type = 'text';
        if (/[a-zA-z]+:\/\/[^\s]*/.test(message)) {
            type = 'url';
        }

        const id = this.addSelfMessage(type, xss(message));
        this.sendMessage(id, type, message);
        this.message.value = '';
    }
    addSelfMessage(type, content) {
        const { user, groupId: toGroup } = this.props;
        const _id = toGroup + Date.now();
        const message = {
            _id,
            type,
            content,
            createTime: Date.now(),
            from: {
                _id: user.get('_id'),
                username: user.get('username'),
                avatar: user.get('avatar'),
            },
            loading: true,
        };

        if (type === 'image') {
            message.percent = 0;
        }
        action.addGroupMessage(toGroup, message);

        return _id;
    }
    @autobind
    sendMessage(localId, type, content) {
        const { groupId: toGroup } = this.props;
        socket.emit('sendMessage', {
            toGroup,
            type,
            content,
        }, (res) => {
            if (typeof res === 'string') {
                Message.error(res);
            } else {
                res.loading = false;
                action.updateSelfMessage(toGroup, localId, res);
            }
        });
    }
    @autobind
    handleSelectExpression(expression) {
        this.handleVisibleChange(false);
        ChatInput.insertAtCursor(this.message, `#(${expression})`);
    }
    sendImageMessage(image) {
        if (image.size > config.maxImageSize) {
            return Message.warning('要发送的图片过大', 3);
        }

        const { user, groupId: toGroup } = this.props;
        const ext = image.type.split('/').pop().toLowerCase();
        const url = URL.createObjectURL(image);

        const img = new Image();
        img.onload = () => {
            const id = this.addSelfMessage('image', `${url}?width=${img.width}&height=${img.height}`);
            socket.emit('uploadToken', {}, (res) => {
                if (typeof token === 'string') {
                    Message.error(res);
                } else {
                    const result = qiniu.upload(image, `ImageMessage/${user.get('_id')}_${Date.now()}.${ext}`, res.token, { useCdnDomain: true }, {});
                    result.subscribe({
                        next(info) {
                            action.updateSelfMessage(toGroup, id, { percent: info.total.percent });
                        },
                        error(err) {
                            console.error(err);
                            Message.error('上传图片失败');
                        },
                        complete: (info) => {
                            const imageUrl = `${res.urlPrefix + info.key}?width=${img.width}&height=${img.height}`;
                            this.sendMessage(id, 'image', imageUrl);
                        },
                    });
                }
            });
        };
        img.src = url;
    }
    @autobind
    async handleSelectFile() {
        const image = await readDiskFile('blob', 'image/png,image/jpeg,image/gif');
        this.sendImageMessage(image.result);
    }
    @autobind
    handlePaste(e) {
        const { items } = (e.clipboardData || e.originalEvent.clipboardData);
        const { types } = (e.clipboardData || e.originalEvent.clipboardData);

        // 如果包含文件内容
        if (types.indexOf('Files') > -1) {
            for (let index = 0; index < items.length; index++) {
                const item = items[index];
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) {
                        const that = this;
                        const reader = new FileReader();
                        reader.onloadend = function () {
                            const image = new Image();
                            image.onload = async () => {
                                const imageBlob = await ChatInput.compressImage(image, file.type, 0.8);
                                that.sendImageMessage(imageBlob);
                            };
                            image.src = this.result;
                        };
                        reader.readAsDataURL(file);
                    }
                }
            }
            e.preventDefault();
        }
    }
    expressionDropdown = (
        <div className="expression-dropdown">
            <Expression onSelect={this.handleSelectExpression} />
        </div>
    )
    featureDropdown = (
        <div className="feature-dropdown">
            <Menu onClick={this.handleFeatureMenuClick}>
                <MenuItem key="image">发送图片</MenuItem>
                <MenuItem key="code">发送代码</MenuItem>
            </Menu>
            <input
                style={{ display: 'none' }}
                type="file"
                accept="image/png,image/jpeg,image/gif"
                ref={i => this.file = i}
                onChange={this.handleSelectFile}
            />
        </div>
    )
    render() {
        const { expressionVisible, codeInputVisible } = this.state;
        const { isLogin } = this.props;

        if (isLogin) {
            return (
                <div className="chat-chatInput">
                    <Dropdown
                        trigger={['click']}
                        visible={expressionVisible}
                        onVisibleChange={this.handleVisibleChange}
                        overlay={this.expressionDropdown}
                        animation="slide-up"
                        placement="topLeft"
                    >
                        <IconButton className="expression" width={44} height={44} icon="expression" iconSize={32} />
                    </Dropdown>
                    <Dropdown
                        trigger={['click']}
                        overlay={this.featureDropdown}
                        animation="slide-up"
                        placement="topLeft"
                    >
                        <IconButton className="feature" width={44} height={44} icon="feature" iconSize={32} />
                    </Dropdown>
                    <Dialog
                        className="codeEditor-dialog"
                        title="请输入要发送的代码"
                        visible={codeInputVisible}
                        onClose={this.handleCodeEditorClose}
                    >
                        <div className="container">
                            <CodeEditor ref={i => this.codeEditor = i} />
                            <button className="codeEditor-button" onClick={this.handleSendCode}>发送</button>
                        </div>
                    </Dialog>
                    <input placeholder="代码会写了吗, 给加薪了吗, 股票涨了吗, 来吐槽一下吧~~" maxLength="2048" ref={i => this.message = i} onKeyDown={this.handleInputKeyDown} onPaste={this.handlePaste} />
                    <IconButton className="send" width={44} height={44} icon="send" iconSize={32} onClick={this.sendTextMessage} />
                </div>
            );
        }
        return (
            <div className="chat-chatInput guest">
                <p>游客朋友你好, 请<b onClick={ChatInput.handleLogin}>登录</b>后参与聊天</p>
            </div>
        );
    }
}

export default connect(state => ({
    isLogin: !!state.getIn(['user', '_id']),
    groupId: state.get('focusGroup'),
    user: state.get('user'),
}))(ChatInput);
