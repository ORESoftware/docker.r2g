'use strict';

import cp = require('child_process');
import path = require("path");
import async = require('async');
import {getCleanTrace} from 'clean-trace';

// project
import log from '../../logger';
import {installDeps} from './install-deps';
import {renameDeps} from './rename-file-deps';
import * as util from "util";
import chalk from "chalk";
import {EVCb} from "../../index";

///////////////////////////////////////////////

export const run = (cwd: string, projectRoot: string, opts: any, argv: Array<string>) => {

  let pkgJSON = null, docker2gConf = null, packages = null, fsMap: any = null;

  const pkgJSONPth = path.resolve(projectRoot + '/package.json');

  try {
    pkgJSON = require(pkgJSONPth);
  }
  catch (err) {
    log.error(chalk.magentaBright('Could not read your projects package.json file.'));
    throw getCleanTrace(err);
  }

  try {
    docker2gConf = require(projectRoot + '/.r2g/config.js');
    docker2gConf = docker2gConf.default || docker2gConf;
    packages = docker2gConf.packages;
  }
  catch (err) {
    log.error(chalk.magentaBright('Could not read your .r2g/config.js file.'));
    throw getCleanTrace(err);
  }

  const dependenciesToInstall = Object.keys(packages || {});
  if (dependenciesToInstall.length < 1) {
    log.warn('You should supply some packages to link, otherwise this is not as useful.');
    log.warn('here is your configuration: ', docker2gConf);
  }

  try {
    fsMap = JSON.parse(process.env.docker_r2g_fs_map)
  }
  catch (err) {
    log.error('could not parse the fs map from the env var.');
    throw getCleanTrace(err);
  }

  async.autoInject({

      copyProjectsInMap(cb: EVCb<any>) {
        installDeps(fsMap, dependenciesToInstall, opts, cb);
      },

      renamePackagesToAbsolute(copyProjectsInMap: any, cb: EVCb<any>) {
        renameDeps(copyProjectsInMap, pkgJSONPth, cb);
      },

      runNpmInstall(renamePackagesToAbsolute: any, cb: EVCb<any>) {

        const k = cp.spawn('bash');
        const cmd = `cd ${projectRoot} && rm -rf node_modules && npm install --production --loglevel=warn`;
        log.info('Now running:', chalk.green(cmd));
        k.stdin.end(cmd);
        k.stderr.pipe(process.stderr);
        k.once('exit', cb);
      },

      runLocalTests(runNpmInstall: any, cb: EVCb<any>) {

        log.info(chalk.magentaBright('now running local tests'));
        process.nextTick(cb);

      },

      r2g(runLocalTests: any, cb: EVCb<any>) {

        log.info('running r2g tests');
        const k = cp.spawn('bash');
        k.stdin.end(`cd ${projectRoot} && r2g run ${argv.join(' ')}`);
        k.stdout.pipe(process.stdout);
        k.stderr.pipe(process.stderr);
        k.once('exit', cb);
      }

    },

    function (err: any, results) {

      let exitCode = 0;

      if (err && err.OK === true) {
        log.info('Successfully run this baby, with a warning:', util.inspect(err, {breakLength: Infinity}));
      }
      else if (err) {
        exitCode = 1;
        log.error(getCleanTrace(err));
      }
      else {
        log.info('Successfully ran r2g.docker');
      }

      if (!opts.forever) {
        // ensure exit occurs
        return process.exit(exitCode);
      }

      process.once('SIGINT', function () {
        log.info('SIGINT captured.');
        process.exit(1);
      });

      log.info('r2g.docker run routine is waiting for exit signal from the user. The container id is:', chalk.bold(process.env.r2g_container_id));
      log.info('to inspect the container, use:', chalk.bold(`docker exec -it ${process.env.r2g_container_id} /bin/bash`));
      log.info('to stop/kill the container, use kill, not stop:', chalk.bold(`docker kill ${process.env.r2g_container_id}`));

      setInterval(() => {
      }, 150000);

    });

};

