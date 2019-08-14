import React, { Component } from 'react';
import { hot } from 'react-hot-loader';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import 'normalize.css';

import action from './state/action';
import Dialog from './components/Dialog';
import Main from './modules/main/Main';
import Login from './modules/main/login/Login';

import './App.less';
import { isMobile } from '../utils/ua';

// App can't be stateless component
class App extends Component {
    static propTypes = {
        showLoginDialog: PropTypes.bool.isRequired,
        backgroundImage: PropTypes.string.isRequired,
    };

    constructor(props) {
        super(props);
        let height = 1;
        if (!isMobile) {
            height = window.innerHeight >= 1000 ? 0.8 : 0.9;
        }
        this.state = {
            width: App.getWidth(),
            height,
            backgroundWidth: window.innerWidth,
            backgroundHeight: window.innerHeight,
        };
    }

    componentDidMount() {
        const img = new Image();
        img.onload = () => {
            this.setState({
                backgroundWidth: Math.max(img.width, window.innerWidth),
                backgroundHeight: Math.max(img.height, window.innerHeight),
            });
        };
        // eslint-disable-next-line react/destructuring-assignment
        img.src = this.props.backgroundImage;

        window.onresize = () => {
            const currentWidth = App.getWidth();
            // eslint-disable-next-line react/destructuring-assignment
            if (currentWidth !== this.state.width) {
                this.setState({
                    width: App.getWidth(),
                });
            }
        };
    }

    get style() {
        const { backgroundWidth, backgroundHeight } = this.state;
        return {
            // eslint-disable-next-line react/destructuring-assignment
            backgroundImage: `url(${this.props.backgroundImage})`,
            backgroundSize: `${backgroundWidth}px ${backgroundHeight}px`,
            backgroundRepeat: 'no-repeat',
        };
    }

    get blurStyle() {
        const { width, height } = this.state;
        const { innerWidth, innerHeight } = window;
        return {
            backgroundPosition: `${(-(1 - width) * innerWidth) / 2}px ${(-(1 - height)
                * innerHeight)
                / 2}px`,
            ...this.childStyle,
            ...this.style,
        };
    }

    get childStyle() {
        const { width, height } = this.state;
        return {
            width: `${width * 100}%`,
            height: `${height * 100}%`,
            position: 'absolute',
            left: `${((1 - width) / 2) * 100}%`,
            top: `${((1 - height) / 2) * 100}%`,
        };
    }

    static getWidth() {
        if (isMobile) {
            return 1;
        }

        let width = 0.6;
        if (window.innerWidth < 1000) {
            width = 0.9;
        } else if (window.innerWidth < 1300) {
            width = 0.8;
        } else if (window.innerWidth < 1600) {
            width = 0.7;
        }
        return width;
    }

    render() {
        const { showLoginDialog } = this.props;
        return (
            <div className="app" style={this.style}>
                <div className="blur" style={this.blurStyle} />
                <div className="child" style={this.childStyle}>
                    <Main />
                </div>
                <Dialog
                    visible={showLoginDialog}
                    closable={false}
                    onClose={action.closeLoginDialog}
                >
                    <Login />
                </Dialog>
            </div>
        );
    }
}

export default connect((state) => ({
    showLoginDialog: state.getIn(['ui', 'showLoginDialog']),
    backgroundImage: state.getIn(['ui', 'backgroundImage']),
}))(hot(module)(App));
