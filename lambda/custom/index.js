/* jshint esversion: 6 */
/* jshint laxbreak: true */
/* global require, exports, console */

"use strict";
const Alexa = require('ask-sdk-core');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
const bgg = require('bgg')();

const HotIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'LaunchRequest'
     || (handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'BGGHotIntent');
  },
  async handle(handlerInput) {
    console.log("handling HotIntent");
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    sessionAttributes.speakOutput = "";

    let pageSize = 10;
    if (isSlotValid("count", isANumber, currentIntent)) {
        pageSize = currentIntent.slots.count.value;
    }

    if (pageSize > 50) {
      sessionAttributes.speakOutput = "Board game geek lists the top fifty games. ";
      pageSize = 10;
    }
    if (handlerInput.requestEnvelope.request.type === 'LaunchRequest') {
      sessionAttributes.speakOutput = "Board game geek dot com ranks the top hot boardgames. ";
    }
      sessionAttributes.speakOutput += `Here are the top ${pageSize}: `;
    try {
      const list = await bgg('hot', {boardgame: ''});
      let items = list.items.item;
      items.slice(0, pageSize).forEach(function(i) {
          sessionAttributes.speakOutput += `${getRandomElement(requestAttributes.t('NEXT_ITEM_MESSAGES')[i.rank-1])} ${i.name.value}. `
      });
    } catch(error){
        console.log(error);
        throw error;
    }

    console.log(sessionAttributes.speakOutput);

    return handlerInput.responseBuilder
      .speak(sessionAttributes.speakOutput)
      .reprompt(sessionAttributes.repromptSpeech)
      .withShouldEndSession(true)
      .getResponse();
  },
};

const HelpHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

    sessionAttributes.speakOutput = requestAttributes.t('HELP_MESSAGE');
    sessionAttributes.repromptSpeech = requestAttributes.t('HELP_MESSAGE');

    return handlerInput.responseBuilder
      .speak(sessionAttributes.speakOutput)
      .reprompt(sessionAttributes.repromptSpeech)
      .getResponse();
  },
};

const RepeatHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.RepeatIntent';
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

    return handlerInput.responseBuilder
      .speak(sessionAttributes.speakOutput)
      .reprompt(sessionAttributes.repromptSpeech)
      .getResponse();
  },
};

const ExitHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent'
        || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent');
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const speakOutput = requestAttributes.t('STOP_MESSAGE', requestAttributes.t('SKILL_NAME'));

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(true)
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    console.log("Inside SessionEndedRequestHandler");
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${JSON.stringify(handlerInput.requestEnvelope)}`);
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    console.log(`Error handled: ${error.message}`);

    return handlerInput.responseBuilder
      .speak(requestAttributes.t('HELP_MESSAGE'))
      .reprompt(requestAttributes.t('HELP_MESSAGE'))
      .getResponse();
  },
};

const languageStrings = {
  en: {
    translation: {
      SKILL_NAME: 'Board Game Geek',
      WELCOME_MESSAGE: [
        '' ],
      NEXT_ITEM_MESSAGES: [
          ["First place is", "At number 1 is", "The hottest boardgame is"],
          ["Second place is", "At number 2 is"],
          ["Third place is", "At number 3 is"],
          ["Fourth place is", "At number 4 is"],
          ["Fifth place is", "At number 5 is"],
          ["Sixth place is", "At number 6 is"],
          ["Seventh place is", "At number 7 is"],
          ["Eighth place is", "At number 8 is"],
          ["Ninth place is", "At number 9 is"],
          ["Tenth place is", "At number 10 is"],
          ["Eleventh place is", "At number 11 is"],
          ["Twelfth place is", "At number 12 is"],
          ["Thriteenth place is", "At number 13 is"],
          ["Fourteenth place is", "At number 14 is"],
          ["Fiftenth place is", "At number 15 is"],
          ["Sixteenth place is", "At number 16 is"],
          ["Seventeenth place is", "At number 17 is"],
          ["Eighteenth place is", "At number 18 is"],
          ["Nineteenth place is", "At number 19 is"],
          ["Twenthith place is", "At number 20 is"],
          ["Twenty-first place is", "At number 21 is"],
          ["Twenty-second place is", "At number 22 is"],
          ["Twenty-third place is", "At number 23 is"],
          ["Twenty-fourth place is", "At number 24 is"],
          ["Twenty-fifth place is", "At number 25 is"],
          ["Twenty-sixth place is", "At number 26 is"],
          ["Twenty-seventh place is", "At number 27 is"],
          ["Twenty-eighth place is", "At number 28 is"],
          ["Twenty-ninth place is", "At number 29 is"],
          ["Thirtieth place is", "At number 30 is"],
          ["Thirty-first place is", "At number 31 is"],
          ["Thirty-second place is", "At number 32 is"],
          ["Thirty-third place is", "At number 33 is"],
          ["Thirty-fourth place is", "At number 34 is"],
          ["Thirty-fifth place is", "At number 35 is"],
          ["Thirty-sixth place is", "At number 36 is"],
          ["Thirty-seventh place is", "At number 37 is"],
          ["Thirty-eighth place is", "At number 38 is"],
          ["Thirty-ninth place is", "At number 39 is"],
          ["Fortieth place is", "At number 40 is"],
          ["Forty-first place is", "At number 41 is"],
          ["Forty-second place is", "At number 42 is"],
          ["Forty-third place is", "At number 43 is"],
          ["Forty-forth place is", "At number 44 is"],
          ["Forty-fifth place is", "At number 45 is"],
          ["Forty-sixth place is", "At number 46 is"],
          ["Forty-seventh place is", "At number 47 is"],
          ["Forty-eighth place is", "At number 48 is"],
          ["Forty-ninth place is", "At number 49 is"],
          ["Fiftieth place is", "At number 50 is"]
      ],
      STOP_MESSAGE: 'Good bye',
      WELCOME_REPROMPT: 'For instructions on what you can say, please say help me.',
      PROMPT: '',
      HELP_MESSAGE: 'Right now I can only list the top hot boardgames from board game geek. Simply what are the top boardgames. Check back soon because I\'m learning more every month.',
    },
  },
};

const LocalizationInterceptor = {
  process(handlerInput) {
    const localizationClient = i18n.use(sprintf).init({
      lng: handlerInput.requestEnvelope.request.locale,
      overloadTranslationOptionHandler: sprintf.overloadTranslationOptionHandler,
      resources: languageStrings,
      returnObjects: true
    });

    const attributes = handlerInput.attributesManager.getRequestAttributes();
    attributes.t = function (...args) {
      return localizationClient.t(...args);
    };
  },
};



function isANumber(maybeNumber) {
  return !isNaN(parseInt(maybeNumber));
}

function lessThan(max) {
    return function(maybeNumber) {
      return isANumber(maybeNumber) && maybeNumber <= max;
    }
}

function isSlotValid(slotName, validate, currentIntent) {
    return currentIntent
      && Object.prototype.hasOwnProperty.call(currentIntent, "slots")
      && Object.prototype.hasOwnProperty.call(currentIntent.slots, slotName)
      && Object.prototype.hasOwnProperty.call(currentIntent.slots[slotName], "value")
      && validate(currentIntent.slots[slotName].value);
}

function getRandomElement(array) {
  let i = 0;
  i = Math.floor(Math.random() * array.length);
  return (array[i]);
}


const skillBuilder = Alexa.SkillBuilders.custom();
exports.handler = skillBuilder
  .addRequestHandlers(
    HotIntentHandler,
    HelpHandler,
    RepeatHandler,
    ExitHandler,
    SessionEndedRequestHandler
  )
  .addRequestInterceptors(LocalizationInterceptor)
  .addErrorHandlers(ErrorHandler)
  .lambda();
