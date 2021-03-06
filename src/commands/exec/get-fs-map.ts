'use strict';

import path = require("path");
import fs = require('fs');
import async = require('async');
import log from "../../logger";
import {Packages} from "./run";
import * as util from "util";
import chalk from "chalk";
import {EVCb} from "../../index";

/////////////////////////////////////////////////////////////////////

type Task = (cb: EVCb<any>) => void;
// queue used to prevent too many dirs searched at once
const q = async.queue<Task, any>((task, cb) => task(cb), 8);

export interface MapResultType {
  [key: string]: string
}

export const getFSMap = (opts: any, searchRoot: string, packages: Packages, cb: EVCb<MapResultType>) => {

  const map: MapResultType = {};

  const searchDir = (dir: string, cb: any) => {

    q.push(callback => {

      fs.readdir(dir, (err, items) => {

        callback(null);

        if (err) {
          log.warn('Could not read directory at path:', dir);
          if (String(err.message || err).match(/permission denied/)) {
            return cb(null);
          }
          return cb(err);
        }

        const mappy = (itemv: string, cb: EVCb<any>) => {

          const item = path.resolve(dir + '/' + itemv);

          fs.lstat(item, (err, stats) => {

            if (err) {
              log.warn(err.message);
              return cb(null);
            }

            if (stats.isSymbolicLink()) {
              opts.verbosity > 2 && log.warn('looks like a symbolic link:', item);
              return cb(null);
            }

            if (stats.isDirectory()) {

              for (let v of ['/.npm', '/.cache', '/node_modules', '/.nvm']) {
                if (item.endsWith(v)) {
                  return cb(null);
                }
              }

              return searchDir(item, cb);
            }

            if (!stats.isFile()) {
              log.warn('unexpected non-file here:', item);
              return cb(null);
            }

            if (!item.endsWith('/package.json')) {
              return cb(null);
            }

            fs.readFile(item, (err, data) => {

              if (err) {
                return cb(err);
              }

              let parsed = null, linkable = null;

              try {
                parsed = JSON.parse(String(data));
              }
              catch (err) {
                log.error('trouble parsing package.json file at path => ', item);
                log.error(err.message || err);
                return cb(err);
              }

              try {
                linkable = parsed.r2g.linkable;
              }
              catch (err) {
                // ignore
              }

              if (linkable === false) {
                return cb(null);
              }

              if (parsed && parsed.name) {

                let nm = parsed.name;

                if (map[nm] && packages[nm]) {

                  log.warn('the following package may exist in more than one place on your fs =>', chalk.magenta(nm));
                  log.warn('pre-existing place => ', chalk.blueBright(map[nm]));
                  log.warn('new place => ', chalk.blueBright(item));

                  return cb(
                    new Error('The following requested package name exists in more than 1 location on disk, and r2g does not know which one to use ... ' +
                      chalk.magentaBright.bold(util.inspect({name: nm, locations: [map[nm], item]})))
                  )
                }
                else if (packages[parsed.name]) {
                  log.info('added the following package name to the map:', parsed.name);
                  map[parsed.name] = item;
                }
              }

              cb(null);

            });

          });

        };

        async.eachLimit(
          items,
          4,
          mappy,
          cb
        );

      });

    });

  };

  searchDir(searchRoot, (err: any) => {
    err && log.error('unexpected error:', err.message || err);
    cb(err, map);
  });

};
