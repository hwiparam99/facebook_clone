/*사용할 미들웨어 등등*/
const express = require("express");
const morgan = require("morgan");
const winston = require("./config/winston");
const mongoose = require("mongoose");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const passport = require("passport");
const Localstrategy = require("passport-local");
const socket = require("socket.io");
const dotenv = require("dotenv");
const helmet = require("helmet");
const hpp = require("hpp");

const flash = require("connect-flash");
const Post = require("./models/Post");
const User = require("./models/User");

/*포트 설정 및 유저 저장 변수*/
const port = process.env.PORT || 3000;
const onlineChatUsers = {};

/*env사용*/
dotenv.config();

const postRoutes = require("./routes/posts");
const userRoutes = require("./routes/users");
const app = express();

app.set("view engine","ejs");

/*미들웨어 설정*/
if(process.env.NODE_ENV === "production") {
    app.use(morgan("combined"));
    // app.enable("trust proxy");
    app.use(helmet({ contentSecurityPolicy: false}));
    app.use(hpp());
} else {
    app.use(morgan("dev"));
}
app.use(cookieParser(process.env.SECRET))
const sessOptions = {
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
    },
};
if(process.env.NODE_ENV === "production") {
    //sessOptions.proxy = true;
    //sessOptions.cookie.secure = true;        실습때만 프록시 설정 제외
}
app.use(seesion(sessOptions));
app.use(flash());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static("public"));

/*passport 설정*/
app.use(passport.initialize());
app.use(passport.session());
passport.use(new Localstrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

/*MongoDB 연결*/
mongoose.connect("mongodb://127.0.0.1:27017/facebook_clone", {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true
}).then(() => {
    winston.info("Connected to MongoDB");
}).catch((err) => {
    winston.error(err);
});

/* Template 파일에 변수 전송*/
app.use((req, res, next) => {
    res.locals.user = req.user;
    res.locals.login = req.isAuthenticated();
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    next();
});

/* Routers */
app.use("/", userRoutes);
app.use("/", postRoutes);

const server = app.listen(port, () => {
    winston.info("App is running on port" + port);
});

/*WebSocket setup */
const io = socket(server);

const room = io.of("/chat");
room.on("connection", (socket) => {
    winston.info("new user : ", socket.id);

    room.emit("newUser", {socketID: socket.id});

    socket.on("newUser", (data) => {
        if(!(data.name in onlineChatUsers)){
            onlineChatUsers[data.name] = data.socketID;
            socket.name = data.name;
            room.emit("updateUserList", Object.keys(onlineChatUsers));
            winston.info("Online users: ", Object.keys(onlineChatUsers));
        }
    });

    socket.on("disconnect", () => {
        delete onlineChatUsers[socket.name];
        room.emit("updateUserList", Object.keys(onlineChatUsers));
        winston.info(`user ${socket.name} disconnected`);
    });

    socket.on("chat", (data) => {
        winston.info(data);
        if(data.to === "Global chat"){
            room.emit("chat", data);
        } else if(data.to){
            room.to(onlineChatUsers[data.name]).emit("chat", data);
            room.to(onlineChatUsers[data.to]).emit("chat", data);
        }
    });
})