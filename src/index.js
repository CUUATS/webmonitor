const fs = require('fs');
const util = require('util');
const express = require('express');
const request = require('request-promise-native');
const SendMail = require('sendmail');

const sendmail = SendMail({
  silent: true
});

const STATUS_UP = 'up';
const STATUS_DOWN = 'down';
const COLOR_BLUE = '\x1b[34m';
const COLOR_GREEN = '\x1b[32m';
const COLOR_RED = '\x1b[31m';
const COLOR_RESET = '\x1b[0m';

class WebMonitor {
  constructor(config) {
    this.config = Object.assign({
      interval: 600
    }, config);

    this.services = this.config.services.map((service) => {
      return {
        name: service.name,
        url: service.url,
        status: null
      };
    });
  }

  start() {
    this.timer = setInterval(() => this.check(), this.config.interval * 1000);
    process.stdout.write(
      `Checking status of ${this.services.length} services... `);
    this.check()
      .then(() => {
        console.log(`${COLOR_BLUE}done${COLOR_RESET}`);
        this.getMessages(this.services, true)
          .forEach((msg) => console.log(msg));
        this.startServer();
      });
  }

  check() {
    this.lastCheck = new Date();
    let changed = [];
    return Promise.all(this.services.map((service) => {
      return this.getStatus(service.url)
        .then((status) => {
          if (service.status !== null && status !== service.status)
            changed.push(service);
          service.status = status;
        });
    })).then(() => this.notify(changed));
  }

  getStatus(url) {
    return request.head(url)
      .then((res) => STATUS_UP)
      .catch((err) => STATUS_DOWN);
  }

  getMessages(services, color) {
    let timestamp = this.lastCheck.toLocaleString();
    return services.map((service) => {
      let message = `[${timestamp}] ${service.name} -> `;
      if (color) message +=
        (service.status === STATUS_UP) ? COLOR_GREEN : COLOR_RED;
      message += service.status;
      if (color) message += COLOR_RESET;
      return message;
    });
  }

  notify(services) {
    if (!services.length) return;
    this.getMessages(services, true).forEach((msg) => console.log(msg));

    sendmail({
      from: this.config.sender,
      to: this.config.recipients.join(', '),
      subject: `Web Monitor: Status change (${services.length})`,
      text: this.getMessages(services).join('\n')
    }, function(e, reply) {
      if (e) console.error(e.stack);
    });
  }

  startServer() {
    process.stdout.write(`Starting web interface... `);
    this.app = express();
    this.app.set('view engine', 'pug');
    this.app.set('views', './src/views');
    this.app.get('/', (req, res) => {
      res.render('index', {
        services: this.services,
        updated: this.lastCheck.toLocaleString()
      });
    });
    this.app.listen(8888,
      () => console.log(`${COLOR_BLUE}done${COLOR_RESET}`));
  }

}

module.exports = WebMonitor;

if (require.main === module) {
  let configPath = process.env.WM_CONFIG || '/etc/webmonitor/config.json';
  fs.readFile(configPath, (err, data) => {
    if (err) {
      console.log('Error reading config file: ' + err);
      process.exit();
    }

    let wm = new WebMonitor(JSON.parse(data));
    wm.start();
  });
}
