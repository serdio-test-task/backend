// routes/githubRoutes.js
const express = require('express');
const passport = require('passport');
const router = express.Router();
const User = require('../models/githubIntegration');  // MongoDB model

const githubController = require('../controllers/githubController');

router.get('/status', githubController.checkStatus);

router.get('/auth', githubController.authGitHub);
router.get('/callback', passport.authenticate('github', { failureRedirect: '/login' }), githubController.githubCallback);
router.delete('/disconnect', githubController.disconnectGitHub);
router.get('/orgs', githubController.getOrganizationsRepos);

router.get('/repos/:org/:repo/details', githubController.getRepoDetails);
module.exports = router;
