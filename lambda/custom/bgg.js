/* jshint esversion: 6 */
/* jshint laxbreak: true */
/* jshint node: true */
/* eslint ecmaVersion: 2017 */

"use strict";

const AWS = require('aws-sdk');
const bgg = require('bgg')();
const TABLENAME = 'bgg-boardgame-hotlist';
AWS.config.update({region: 'us-west-2'});
const docClient = new AWS.DynamoDB.DocumentClient();


function makeBulkPutRequest(items) {
  const now = (Date.now() / 1000) + (60 * 60);
  const requests = items.map( (item) => {
    const i = item;
    i.id = parseInt(i.id);
    i.rank = parseInt(i.rank);
    i.createdAt = now;
    i.thumbnail = (i.thumbnail && i.thumbnail.length !== 0) && i.thumbnail || 'https://cf.geekdo-static.com/images/geekdo/bgg_cornerlogo.png';
    return { PutRequest: { Item: i } };
  });
  const request = { RequestItems: { } };
  request.RequestItems[TABLENAME] = requests;
  return request;
}

async function getHotListFromDDB() {
  const params = {
    TableName: TABLENAME,
    Select: "ALL_ATTRIBUTES"
  };

  try {
    const results = await docClient.scan(params).promise();
    console.debug(`SCAN RESULTS:\n ${results.Items}`);
    return results.Items.sort((a,b) => { return a.rank - b.rank;});
  } catch(error) {
    console.error(`getFromDDB: ${error}`);
  }
}

async function putHotListToDDB() {
  try {
    const bggList = await bgg("hot", {boardgame: ''});
    console.debug(`BGG Response: ${bggList.items.item}`);
    let params = makeBulkPutRequest(bggList.items.item.slice(0,25));
    console.debug(`PutRequest1: ${JSON.stringify(params)}`);
    let results = await docClient.batchWrite(params).promise();
    console.debug(`BATCHWRITE_1: ${JSON.stringify(results)}`);

    params = makeBulkPutRequest(bggList.items.item.slice(25,50));
    console.debug(`PutRequest2: ${JSON.stringify(params)}`);
    results = await docClient.batchWrite(params).promise();
    console.debug(`BATCHWRITE_2: ${JSON.stringify(results)}`);
    return bggList.items.item;
  } catch(error) {
    console.error(`putToDDB ${error}`);
  }

}


module.exports = {
  async getHotList() {
    try {
      const list = await getHotListFromDDB();
      if (list.length > 0) {
        return list;
      } else {
        return await putHotListToDDB();
      }
    } catch(err) {
      console.log(err);
    }
  },
  async loadGame(gameId) {
    const resp = await bgg("thing", {thingtype: 'boardgame', id: gameId});
    return resp.items.item;
  },
  async search(query) {
    const resp = await bgg("search", {thingtype: 'boardgame', query});
    return resp.items.item;
  }
};

