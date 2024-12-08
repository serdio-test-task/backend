const mongoose = require('mongoose');

const githubIntegrationSchema = new mongoose.Schema({
    githubId: { type: String, required: true, unique: true },
    accessToken: { type: String, required: true },
    profile: { type: Object, required: true },
    connectedAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', githubIntegrationSchema);

module.exports = User;
