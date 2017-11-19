![Logo](./admin/systeminfo.png) 
# Liest (und schreibt) Informationen von Systemen
================================

[![NPM version](http://img.shields.io/npm/v/iobroker.systeminfo.svg)](https://www.npmjs.com/package/iobroker.systeminfo)
[![Downloads](https://img.shields.io/npm/dm/iobroker.systeminfo.svg)](https://www.npmjs.com/package/iobroker.systeminfo)

**Tests:** Linux/Mac: [![Travis-CI Build Status](https://travis-ci.org/frankjoke/ioBroker.systeminfo.svg?branch=master)](https://travis-ci.org/frankjoke/ioBroker.systeminfo)
Windows: [![AppVeyor Build status](https://ci.appveyor.com/api/projects/status/pil6266rrtw6l5c0?svg=true)](https://ci.appveyor.com/project/frankjoke/iobroker-systeminfo)

[![NPM](https://nodei.co/npm/iobroker.systeminfo.png?downloads=true)](https://nodei.co/npm/iobroker.systeminfo/)

## Adapter für verschiedene Systeminfos oder daten die von Systemen ausgelesen und teilweise auch beschrieben werden können

Der Adapter generiert states aufgrund von Konfigurationsdaten welche:
* Ergebnisse von Befehlen sein die im Betriebssystem auf dem der Adapter läft ausgeführt werden
* Ergebnisse die aus Dateien gelesen werden
* Ergebnisse von Webabfragen
* Ergebnisse von nodejs-Variablen

### Note

## Configuration
* Mit Adapter.config die Konfiguration der einzelnen Informationsquellen mittels

## Known-Issues
* Beta test 

## Important/Wichtig
* Requires node >=v4.5

## Changelog
### 0.2.0
* First public beta includes jsonParse and WebQuery parse

### 0.1.0
* First working instance for files, exe and systeminfo

### Todo for later revisions
* Allow for plugins for new datasources

## Installation

Mit ioBroker admin, npm install iobroker.systeminfo oder von <https://github.com/frankjoke/ioBroker.systeminfo> 

## License

The MIT License (MIT)

Copyright (c) 2017, frankjoke <frankjoke@hotmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
