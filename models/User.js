const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    name: String,
    email: String,
    password: String,
    handle: String,
    verified: Boolean,
    fakeLastName: String
});

const User = mongoose.model('User', UserSchema);

module.exports = User;