const express = require('express');
const router = express.Router();

// axios
const axios = require('axios');

// mongodb user model
const User = require('./../models/User');

// mongodb userVerification model
const UserVerification = require('./../models/UserVerification');

const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const bcrypt = require('bcrypt');

// path for static verified page
const path = require("path");

// nodemailer intializations
let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.AUTH_EMAIL,
        pass: process.env.AUTH_PASS,
    }
})

// Testing whether the transporter is working properly
transporter.verify((err, success) => {
    if (err) console.log(err);
    else {
        console.log("Ready for messages");
        console.log(success);
    }
})

// setting server url
const development = "http://localhost:3000/";
const production = "https://evening-forest-99452.herokuapp.com/";
const currentUrl = process.env.NODE_ENV ? production : development;


//Signup
router.post('/signup', (req, res) => {
    let { name, email, password, handle } = req.body;
    name = name.trim();
    email = email.trim();
    password = password.trim();
    handle = handle.trim();
    let fakeLastName = (Math.random() + 1).toString(36).substring(7);

    if (name == "" || email == "" || password == "" || handle == "") {
        res.json({
            status: "FAILED",
            message: "Empty input Fields!"
        });
    } else if (!/^[a-zA-Z ]*$/.test(name)) {
        res.json({
            status: "FAILED",
            message: "Invalid name entered"
        })
    } else if (!/^([a-zA-Z0-9\.-]+)@(srmist).(edu).(in)/.test(email) && !/^([a-zA-Z0-9\.-]+)@(lnmiit).(ac).(in)/.test(email)) {
        res.json({
            status: "FAILED",
            message: "Invalid email entered"
        })
    } else if (!/^([a-zA-Z0-9\.-]+)/.test(handle)) {
        res.json({
            status: "FAILED",
            message: "Invalid handle entered"
        })
    } else if (password.length < 8) {
        res.json({
            status: "FAILED",
            message: "Password is too short!"
        })
    } else {
        // Checking if user already exists
        User.find({ email }).then(result => {
            if (result.length) {
                // A user already exists
                res.json({
                    status: "FAILED",
                    message: "User with the provided email already exists"
                })
            } else {
                // Try to create new user

                // password handling
                const saltRounds = 10;
                bcrypt.hash(password, saltRounds).then(hashedPassword => {
                    const newUser = new User({
                        name,
                        email,
                        password: hashedPassword,
                        handle,
                        verified: false,
                        fakeLastName
                    });

                    newUser.save().then(result => {
                        // res.json({
                        //     status: "SUCCESS",
                        //     message: "Sign Up successful",
                        //     data: result,
                        // })
                        // handle account verification
                        sendVerificationEmail(result, res);
                    }).catch(err => {
                        console.log(err);
                        res.json({
                            status: "FAILED",
                            message: "An error occured while Saving User Account"
                        })
                    })
                }).catch(err => {
                    console.log(err);
                    res.json({
                        status: "FAILED",
                        message: "An error occured while hashing password!"
                    })
                })
            }
        }).catch(err => {
            console.log(err);
            res.json({
                status: "FAILED",
                message: "An error occured while checking for existing user!"
            })
        })
    }
})

const sendVerificationEmail = ({ _id, email,fakeLastName }, res) => {
    const uniqueString = uuidv4() + _id;

    // mail options
    const mailOptions = {
        from: process.env.AUTH_EMAIL,
        to: email,
        subject: "Verify Your Email",
        html: `<p>Verify your email address to complete the signup and login into your account.</p><p>This link
        <b>expires in 6 hours</b>.</p><p>Press <a href=${currentUrl + "user/verify/" + _id + "/" + uniqueString
            }>here</a> to proceed.</p>`,
    }

    // hash the uniqueString
    const saltRounds = 10;
    bcrypt
        .hash(uniqueString, saltRounds)
        .then((hashedUniqueString) => {
            // set values in userVerification collection
            const newVerification = new UserVerification({
                userId: _id,
                uniqueString: hashedUniqueString,
                createdAt: Date.now(),
                expiresAt: Date.now() + 2160000,
            })
            newVerification
                .save()
                .then(
                    transporter
                        .sendMail(mailOptions)
                        .then(() => {
                            // email sent and verification record saved
                            res.json({
                                status: "PENDING",
                                message: `Verification email sent and Please Change Codeforces handle LastName to ${fakeLastName}.`,
                                data: {
                                    userId: _id,
                                    email,
                                    fakeLastName
                                }
                            })
                        })
                )
                .catch((err) => {
                    console.log(err);
                    res.json({
                        status: "FAILED",
                        message: "Couldn't save verification email data!",
                    })
                })
        })
        .catch(() => {
            res.json({
                status: "FAILED",
                message: "An error occured while hashing email data!"
            })
        })
}

// resend verification
router.post("/resendVerificationLink", async (req, res) => {
    try {
        let { userId, email } = req.body;

        if (!userId || !email) {
            throw Error("Empty user details are not allowed");
        } else {
            // delete existing records and resend
            await UserVerification.deleteMany({ userId });
            sendVerificationEmail({ _id: userId, email }, res);
        }
    } catch (err) {
        res.json({
            status: "Failed",
            message: `Verification Link Resend Error. ${error.message}`,
        })
    }
})

// verify email
router.get("/verify/:userId/:uniqueString", (req, res) => {
    let { userId, uniqueString } = req.params;

    UserVerification
        .find({ userId })
        .then(result => {
            if (result.length > 0) {
                // user verification record exists so we proceed
                const { expiresAt } = result[0];
                const hashedUniqueString = result[0].uniqueString;

                // checking 4 expired unique string
                if (expiresAt < Date.now()) {
                    // record has expired so we delete it
                    UserVerification
                        .deleteOne({ userId })
                        .then(result => {
                            User
                                .deleteOne({ _id: userId })
                                .then(() => {
                                    let message = "Link has expired. Please sign up again.";
                                    res.redirect(`/user/verified/error=true&message=${message}`);
                                })
                                .catch(err => {
                                    let message = "Clearing user with expired unique string failed";
                                    res.redirect(`/user/verified/error=true&message=${message}`);
                                })
                        })
                        .catch(err => {
                            console.log(err);
                            let message = "An error occurred while clearing expired user verification record";
                            res.redirect(`/user/verified/error=true&message=${message}`);
                        })
                } else {
                    bcrypt
                        .compare(uniqueString, hashedUniqueString)
                        .then(result => {
                            if (result) {
                                // strings match
                                User
                                    .updateOne({ _id: userId }, { verified: true })
                                    .then(() => {
                                        UserVerification
                                            .deleteOne({ userId })
                                            .then(() => {
                                                res.sendFile(path.join(__dirname, "./../views/verified.html"));
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                let message = "An error occurred while finalizing successful verification";
                                                res.redirect(`/user/verified/error=true&message=${message}`);
                                            })
                                    })
                                    .catch(err => {
                                        console.log(err);
                                        let message = "An error occurred while updating user record to show verified.";
                                        res.redirect(`/user/verified/error=true&message=${message}`);
                                    })
                            } else {
                                let message = "Invalid verification details passed. Check your inbox.";
                                res.redirect(`/user/verified/error=true&message=${message}`);
                            }
                        })
                        .catch(err => {
                            let message = "An error occurrd while comparing unique strings.";
                            res.redirect(`/user/verified/error=true&message=${message}`);
                        })
                }
            } else {
                // user verification record doesn't exist
                let message = "Account record doesn't exist or has been verified already. Please sign up or log in";
                res.redirect(`/user/verified/error=true&message=${message}`);
            }
        })
        .catch((err) => {
            console.log(err);
            let message = "An error occurred while checking for existing user verification record";
            res.redirect(`/user/verified/error=true&message=${message}`);
        })
})

// Verified page route
router.get("/verified", (req, res) => {
    res.sendFile(path.join(__dirname, "./../views/verified.html"));
})

// Signin
router.post('/signin', (req, res) => {
    let { email, password } = req.body;
    email = email.trim();
    password = password.trim();

    if (email == "" || password == "") {
        res.json({
            status: "FAILED",
            message: "Empty credentials supplied"
        })
    } else {
        // Check if user exist
        User.find({ email }).then(data => {
            if (data) {
                // User exists
                console.log(data[0]);
                let status = true;
                if (data[0].fakeLastName) console.log("It exists");
                else console.log("It doesn't exist"), status = false;
                axios.get(`https://codeforces.com/api/user.info?handles=${data[0].handle}`)
                    .then(function (response) {
                        // handle success
                        console.log(response.data.result[0]);
                        let lastName = response.data.result[0].lastName;
                        // let fakeLastName = data[0].fakeLastName;
                        if (data[0].fakeLastName && lastName == data[0].fakeLastName) {
                            // U r authorized
                            // User.update({ email: email }, { $unset : { fakeLastName : 1} });
                            status = false;
                            console.log("Comparasion was triggered!");
                            User.collection.update({ email: email }, { $unset: { fakeLastName: 1 } });
                        }
                        // check if the user is verified
                        if (!data[0].verified) {
                            res.json({
                                status: "FAILED",
                                message: "Email hasn't been verified yet. Check your inbox."
                            })
                        }
                        //check if the user verified their cf_handle
                        else if (status) {
                            res.json({
                                status: "FAILED",
                                message: `Codefroces handle not verified. Plz Change your Codeforces lastname to ${data[0].fakeLastName}. After logging in you can revert to your orignal LastName`
                            })
                        }
                        else {
                            const hashedPassword = data[0].password;
                            bcrypt.compare(password, hashedPassword).then(result => {
                                if (result) {
                                    // Password match
                                    res.json({
                                        status: "SUCCESS",
                                        message: "Signin successful",
                                        data: data
                                    })
                                } else {
                                    res.json({
                                        status: "FAILED",
                                        message: "Invalid Password Entered!"
                                    })
                                }
                            }).catch(err => {
                                res.json({
                                    status: "FAILED",
                                    message: "An error occurred while comparing passwords"
                                })
                            })
                        }
                    })
                    .catch(function (error) {
                        // handle error
                        console.log(error);
                    })

            } else {
                res.json({
                    status: "FAILED",
                    message: "Invalid Credentials"
                })
            }
        }).catch(err => {
            res.json({
                status: "FAILED",
                message: "User not found. Please Signup."
            })
        })
    }
})

router.get("/getUsers", async (req,res) => {
    User.find({}, 'handle',(err,data) => {
        if(err) console.log(err);
        else console.log(data),res.json(data);
    })
})

module.exports = router;
