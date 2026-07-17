#!/usr/bin/env node
"use strict";

process.env.DOCKER_BROWSER_GATE = "1";
require("./playtest-full-activation-v11.js");
