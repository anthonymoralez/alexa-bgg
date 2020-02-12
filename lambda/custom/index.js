/* jshint esversion: 6 */
/* jshint laxbreak: true */
/* jshint node: true */
/* eslint ecmaVersion: 2017 */
// vim: ts=4 sw=4 expandtab

"use strict";
const Alexa = require('ask-sdk-core');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
const bgg = require('./bgg');

const CFIRHotListHandler = {
    canHandle(handlerInput){
        console.log('CAN_HANDLE: CFIRHotListHandler');
        return handlerInput.requestEnvelope.request.type === `CanFulfillIntentRequest` &&
            handlerInput.requestEnvelope.request.intent.name === 'BGGHotIntent';
    },
    handle(handlerInput) {
        console.log(`HANDLER: CFIRHotListHandler`);
        console.log(`REQUEST ENVELOPE: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        const currentIntent = handlerInput.requestEnvelope.request.intent;
        if (isSlotValid("count", isANumber, currentIntent)) {
            const count =  currentIntent.slots.count.value;
            const canFulfill = (count < 50) ? "YES": "NO";
            return handlerInput.responseBuilder
                .withCanFulfillIntent(
                    {
                        "canFulfill": canFulfill,
                        "slots":{
                            "count": {
                                "canUnderstand": canFulfill,
                                "canFulfill": canFulfill
                            }
                        }
                    })
                .getResponse();
        }
        return handlerInput.responseBuilder
            .withCanFulfillIntent(
                {
                    "canFulfill": "YES"
                })
            .getResponse();
    }
}
const CFIRShowBGIHandler = {
    canHandle(handlerInput){
        console.log('CAN_HANDLE: CFIRShowBGIHandler');
        return handlerInput.requestEnvelope.request.type === `CanFulfillIntentRequest` &&
            handlerInput.requestEnvelope.request.intent.name === 'ShowBoardGameIntent';
    },
    async handle(handlerInput) {
        console.log(`HANDLER: CFIRShowBGIHandler`);
        console.log(`REQUEST ENVELOPE: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        const currentIntent = handlerInput.requestEnvelope.request.intent;
        if (hasSlot("gameName", currentIntent)) {
            const name = getSlotValue("gameName", currentIntent).toLowerCase();
            const results = await bgg.search(name);
            console.log(results);
            if (results && results.length !== 0) {
                return handlerInput.responseBuilder
                    .withCanFulfillIntent(
                        {
                            "canFulfill": "YES",
                            "slots":{
                                "gameName": {
                                    "canUnderstand": "YES",
                                    "canFulfill": "YES"
                                }
                            }
                        })
                    .getResponse()
            }
        }
        return handlerInput.responseBuilder
            .withCanFulfillIntent(
                {
                    "canFulfill": "NO",
                    "slots":{
                        "gameName": {
                            "canUnderstand": "NO",
                            "canFulfill": "NO"
                        }
                    }
                })
            .getResponse()
    }
};

const ShowBoardGameIntentHandler = {
    canHandle(handlerInput) {
        console.log('CAN_HANDLE: ShowBoardGameIntentHandler');
        return handlerInput.requestEnvelope.request.type === 'Display.ElementSelected'
            || (handlerInput.requestEnvelope.request.type === 'IntentRequest'
                && handlerInput.requestEnvelope.request.intent.name === 'ShowBoardGameIntent');
    },
    async handle(handlerInput) {
        console.log(`HANDLER: ShowBoardGameIntent`);
        const request = handlerInput.requestEnvelope.request;
        const currentIntent = request.intent;
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        sessionAttributes.speakOutput = "";

        let id;
        let gameName;
        if (request.token) {
            id = request.token;
            console.log(`request.token: ${request.token}`);
        } else if (hasSlot("gameName", currentIntent)) {
            const name = getSlotValue("gameName", currentIntent).toLowerCase();
            if (isANumber(name)) {
                if (sessionAttributes.pageSize === undefined) {
                    sessionAttributes.pageSize = 10;
                }

                console.log(`sessionAttributes: ${JSON.stringify(sessionAttributes)}`);
                if (sessionAttributes.items && sessionAttributes.items.length === 0) {
                    await loadItems(handlerInput);
                    console.log("loaded games");
                }

                const rank = parseInt(name,10);
                id = sessionAttributes.items[rank - 1].id;
                gameName = `the ${ordinalSuffix(rank)} hottest game`;
            } else {
                gameName = name;
                console.log(`gameName: ${name}`);
                console.log(`sessionAttributes: ${JSON.stringify(sessionAttributes)}`);

                if (sessionAttributes.items && sessionAttributes.items.length !== 0) {
                    console.log('checking session for game id');

                    let item = sessionAttributes.items.find(function(i) {
                        return i.name.value.toLowerCase() === name;
                    });
                    if (item !== undefined) {
                        console.log("found in hot games");
                        id = item.id;
                    }
                }
            }
            if (id === undefined) {
                const searchingMessage = `Searching board game geek dot com for ${name}...`
                console.log(searchingMessage);
                await callDirectiveService(handlerInput, searchingMessage);
                const results = await bgg.search(name);
                console.log(results);
                if (results && results.length !== 0) {
                    id = getBestMatch(results, function(i) { return i.name.value.toLowerCase() === name;  }).id;
                } else {
                    return gameNotFound(handlerInput, sessionAttributes);
                }
            }
        } else {
            return gameNotFound(handlerInput, sessionAttributes);
        }

        if (id === null) {
            return gameNotFound(handlerInput, sessionAttributes);
        }
        await callDirectiveService(handlerInput, `Let me see, where are the details for ${gameName}...`);
        const game = await bgg.loadGame(id);
        await callDirectiveService(handlerInput, `ah, found them`);
        console.log(JSON.stringify(game));
        sessionAttributes.lastGame = sessionAttributes.currentGame;
        sessionAttributes.currentGame = game;

        if (supportsDisplay(handlerInput)) {
            console.log("displaying body template");
            const body3 = bodyTemplate3(game, handlerInput.responseBuilder, sessionAttributes);
            console.log(JSON.stringify(body3));
            return body3;
        } else {
            sessionAttributes.speakOutput += describeCategoryAndMechanics(game);
            return handlerInput.responseBuilder
                .speak(sessionAttributes.speakOutput)
                .reprompt(sessionAttributes.repromptSpeech)
                .withShouldEndSession(true)
                .getResponse();
        }
    }
};

const HotIntentHandler = {
    canHandle(handlerInput) {
        console.log('CAN_HANDLE: HotIntentHandler');
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest'
            || (handlerInput.requestEnvelope.request.type === 'IntentRequest'
                && handlerInput.requestEnvelope.request.intent.name === 'BGGHotIntent');
    },
    async handle(handlerInput) {
        console.log(`HANDLER: HotIntentHandler`);
        const request = handlerInput.requestEnvelope.request
        const currentIntent = request.intent;
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        sessionAttributes.speakOutput = "";

        if (request.type === 'LaunchRequest' && handlerInput.requestEnvelope.session.new) {
            sessionAttributes.speakOutput = "Board game geek dot com ranks the top hot boardgames. ";
        }

        sessionAttributes.pageSize = 10;
        if (isSlotValid("count", isANumber, currentIntent)) {
            sessionAttributes.pageSize = currentIntent.slots.count.value;
        }

        if (sessionAttributes.pageSize > 50) {
            sessionAttributes.speakOutput += "Board game geek lists the top fifty games. ";
            sessionAttributes.pageSize = 10;
        }
        sessionAttributes.listOutput = `Here are the top ${sessionAttributes.pageSize}: `;

        await loadItems(handlerInput);
        if (sessionAttributes.items === undefined) {
            sessionAttributes.speakOutput += "Unfortunately, I can't get information from board game geek right now."
            return handlerInput.responseBuilder
                .speak(sessionAttributes.speakOutput)
                .reprompt(sessionAttributes.repromptSpeech)
                .withShouldEndSession(true)
                .getResponse();
        } else {
            sessionAttributes.items.forEach(function(i) {
              sessionAttributes.listOutput += `${getRandomElement(requestAttributes.t('NEXT_ITEM_MESSAGES')[i.rank-1])} ${i.name.value}. `;
            });
            sessionAttributes.speakOutput += sessionAttributes.listOutput
            console.log(sessionAttributes.speakOutput);

            if (supportsDisplay(handlerInput)) {
                console.log("displaying list2 template");
                const list2 = listTemplateMaker('ListTemplate2', handlerInput, sessionAttributes.items, `Board Game Geek Top ${sessionAttributes.pageSize} Boardgames`, `${requestAttributes.t('NEXT_ITEM_MESSAGES')[0][2]} ${sessionAttributes.items[0].name.value}`);
                console.log(JSON.stringify(list2));
                return list2;
            } else {
                return handlerInput.responseBuilder
                    .speak(sessionAttributes.speakOutput)
                    .reprompt(sessionAttributes.repromptSpeech)
                    .withShouldEndSession(true)
                    .getResponse();
            }
        }
    },
};

const PreviousIntentHandler = {
    canHandle(handlerInput) {
        console.log('CAN_HANDLE: PreviousIntentHandler');
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.PreviousIntent';
    },
    handle(handlerInput) {
        console.log(`HANDLER: PreviousIntentHandler`);
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        console.log(JSON.stringify(attributes));

        if (supportsDisplay(handlerInput) && attributes.lastGame && attributes.currentGame) {
            attributes.currentGame = attributes.lastGame;
            attributes.lastGame = undefined;
            attributes.speakOutput = '';
            return bodyTemplate3(attributes.currentGame, handlerInput.responseBuilder, attributes);
        } else if (supportsDisplay(handlerInput) && attributes.lastGame === undefined && attributes.items) {
            console.log("displaying main list");
            attributes.lastGame = undefined;
            return listTemplateMaker('ListTemplate2', handlerInput, attributes.items, `Board Game Geek Top ${attributes.pageSize} Boardgames`, attributes.listOutput);
        } else {
            const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
            attributes.speakOutput = requestAttributes.t('HELP_MESSAGE');
            attributes.repromptSpeech = requestAttributes.t('HELP_MESSAGE');

            return handlerInput.responseBuilder
                .speak(attributes.speakOutput)
                .reprompt(attributes.repromptSpeech)
                .getResponse();
        }
    }
};

const HelpHandler = {
    canHandle(handlerInput) {
        console.log('CAN_HANDLE: HelpHandler');
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        console.log(`HANDLER: HelpHandler`);
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
        console.log('CAN_HANDLE: RepeatHandler');
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.RepeatIntent';
    },
    handle(handlerInput) {
        console.log(`HANDLER: RepeatHandler`);
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

        return handlerInput.responseBuilder
            .speak(sessionAttributes.speakOutput)
            .reprompt(sessionAttributes.repromptSpeech)
            .getResponse();
    },
};

const ExitHandler = {
    canHandle(handlerInput) {
        console.log('CAN_HANDLE: ExitHandler');
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent'
                || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent');
    },
    handle(handlerInput) {
        console.log(`HANDLER: ExitHandler`);
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
            HELP_MESSAGE: 'I can list the top hot boardgames from board game geek. Just ask what are the top boardgames. I can also look for and describe boardgames. Simple as me to describe a specific game. For example, describe Ticket to Ride. Check back soon because I\'m learning more every month.',
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


async function loadItems(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    await callDirectiveService(handlerInput, "Checking board game geek dot com...");
    try {
        const items = await bgg.getHotList();
        if (items !== undefined) {
            sessionAttributes.items = items.slice(0, sessionAttributes.pageSize);
        } else {
            sessionAttributes.items = undefined
        }

    } catch(error){
        console.log(error);
        throw error;
    }
}

async function callDirectiveService(handlerInput, message) {
  // Call Alexa Directive Service.
  if (handlerInput.requestEnvelope.request.type === 'Display.ElementSelected') {
      // Don't use directive service when handling touch events
      return;
  }
  const requestEnvelope = handlerInput.requestEnvelope;
  const directiveServiceClient = handlerInput.serviceClientFactory.getDirectiveServiceClient();

  const requestId = requestEnvelope.request.requestId;
  const endpoint = requestEnvelope.context.System.apiEndpoint;
  const token = requestEnvelope.context.System.apiAccessToken;

  // build the progressive response directive
  const directive = {
    header: {
      requestId,
    },
    directive: {
      type: 'VoicePlayer.Speak',
      speech: message
    },
  };

  // send directive
  try {
      const resp = await directiveServiceClient.enqueue(directive, endpoint, token);
      return resp;
  } catch(err) {
      console.log(`ERROR: callDirectiveService - ${err}`);
  }
}

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

function imageMaker(pDesc, pSource) {
    const myImage = new Alexa.ImageHelper()
        .withDescription(pDesc)
        .addImageInstance(pSource)
        .getImage();

    return myImage;
}

function supportsDisplay(handlerInput) {
    var hasDisplay =
        handlerInput.requestEnvelope.context &&
        handlerInput.requestEnvelope.context.System &&
        handlerInput.requestEnvelope.context.System.device &&
        handlerInput.requestEnvelope.context.System.device.supportedInterfaces &&
        handlerInput.requestEnvelope.context.System.device.supportedInterfaces.Display
    return hasDisplay;
}

function gameSuggestion(sessionAttributes) {
    let gameSuggestion
    if (sessionAttributes.items && sessionAttributes.items.length > 0) {
        gameSuggestion =sessionAttributes.items[0].name.value
    } else {
        gameSuggestion = getRandomElement(["Scythe", "Agricola", "Root", "Suburbia"])
    }
    return gameSuggestion
}

function gameNotFound(handlerInput, sessionAttributes) {
    const suggestion = gameSuggestion(sessionAttributes)
    sessionAttributes.speakOutput = "I'm sorry. I think you were asking me to tell you about a board game, but I didn't catch the name or number of the game.";
    sessionAttributes.repromptSpeech = ` You can say describe ${suggestion}. Or you can say describe three, and I will describe the third game in the hot list. You can always say exit`;
    sessionAttributes.speakOutput += sessionAttributes.repromptSpeech;
    return handlerInput.responseBuilder
        .speak(sessionAttributes.speakOutput)
        .reprompt(sessionAttributes.repromptSpeech)
        .withShouldEndSession(false)
        .getResponse();
}

function bodyTemplate3(game, response, sessionAttributes) {
    sessionAttributes.speakOutput += describeCategoryAndMechanics(game);

    const bodyTemplateDirective = {
        type: "BodyTemplate3",
        token: game.id,
        title: game.name.value,
        image: imageMaker(game.name.value, game.thumbnail),
        textContent:new Alexa.PlainTextContentHelper()
            .withPrimaryText(sessionAttributes.speakOutput)
            .withSecondaryText(getBoxStats(game))
            .getTextContent()
    };

    response.speak(sessionAttributes.speakOutput);

    return response
        .addRenderTemplateDirective(bodyTemplateDirective)
        .getResponse();
}

function getBoxStats(game) {
    return `👨‍👩‍👧‍👦 ${game.minplayers.value} to ${game.maxplayers.value}.\n⏰ ${game.playingtime.value} minutes.`
}

function describeCategoryAndMechanics(game) {
    let response = getFirstOrOnly(game.name).value;
    const designers = selectLinkValues(game.link, 'boardgamedesigner');
    const artists = selectLinkValues(game.link, 'boardgameartist');
    const categories = selectLinkValues(game.link, 'boardgamecategory');
    const mechanics = selectLinkValues(game.link, 'boardgamemechanic');

    response += joinWithIntro(designers, ", by ");
    response += joinWithIntro(categories, `, is ${chooseArticle(categories[0])} `) + maybeSayGame(categories);
    response += ` for ${game.minplayers.value} to ${game.maxplayers.value} players that plays in approximately ${game.playingtime.value} minutes. `
    response += joinWithIntro(artists, "With art by ");
    response += joinWithIntro(mechanics, ', using the following mechanics: ');

    return response;
}

function joinWithIntro(words, intro) {
    if (words.length !== 0) {
        insertAndIfNecessary(words);
        return `${intro}${words.join(", ")}`;
    }
    return "";
}

// Link id === 3 is the "Unknown" designer/artist/etc
function selectLinkValues(link, type) {
    return link
        .filter((l) => { return l.type === type && l.id !== '3'; })
        .map(function(l) { return l.value; });
}

function maybeSayGame(categories) {
    if (categories.find((l) => { return l.toLowerCase().includes('game')})) {
        return '';
    } else {
        return ' game';
    }
}

function ordinalSuffix(i) {
    const j = i % 10;
    const k = i % 100;
    if (j == 1 && k != 11) {
        return `${i}st`;
    }
    if (j == 2 && k != 12) {
        return `${i}nd`;
    }
    if (j == 3 && k != 13) {
        return `${i}rd`;
    }
    return `${i}th`;
}

const VOWELS = "AEIOUaeiou";
function chooseArticle(word) {
    if (typeof word !== 'string' && !word instanceof String) {
        return "";
    }
    if (VOWELS.includes(word.charAt(0)) || word === 'hour') {
        return "an";
    }
    return "a";
}

function insertAndIfNecessary(list) {
    if (list.length > 1) {
        list.splice(list.length - 1, 0, 'and');
    }
}

function listTemplateMaker(pListTemplateType, pHandlerInput, pArray, pTitle, pOutputSpeech) {
    const response = pHandlerInput.responseBuilder;
    var title = pTitle;
    const itemList = pArray.map((i) => {
        return {
            "token": i.id.toString(),
            "textContent": new Alexa.PlainTextContentHelper().withPrimaryText(i.name.value).getTextContent(),
            "image": imageMaker(i.name.value, i.thumbnail.value)
        };
    });

    if (pOutputSpeech) {
        response.speak(pOutputSpeech);
    }

    response.addRenderTemplateDirective({
        type: pListTemplateType,
        backButton: 'hidden',
        title,
        listItems: itemList
    });

    return response.getResponse();
}

function getBestMatch(maybeArray, matcher) {
    if (!Array.isArray(maybeArray)) {
        return maybeArray;
    }

    const maybeExactMatch = maybeArray.find(matcher);
    if (maybeExactMatch !== undefined) {
        return maybeExactMatch;
    } else {
        return maybeArray[0];
    }
}

function getFirstOrOnly(maybeArray) {
    if (Array.isArray(maybeArray)) {
        return maybeArray[0];
    } else {
        return maybeArray;
    }
}

function hasSlot(slotName, currentIntent) {
  return Object.prototype.hasOwnProperty.call(currentIntent, "slots")
      && Object.prototype.hasOwnProperty.call(currentIntent.slots, slotName)
      && Object.prototype.hasOwnProperty.call(currentIntent.slots[slotName], "value");
}

function getSlotValue(slotName, currentIntent) {
  return Object.prototype.hasOwnProperty.call(currentIntent, "slots")
      && Object.prototype.hasOwnProperty.call(currentIntent.slots, slotName)
      && Object.prototype.hasOwnProperty.call(currentIntent.slots[slotName], "value")
      && currentIntent.slots[slotName].value;
}

const skillBuilder = Alexa.SkillBuilders.custom();
exports.handler = skillBuilder
    .addRequestHandlers(
        CFIRHotListHandler,
        CFIRShowBGIHandler,
        ShowBoardGameIntentHandler,
        HotIntentHandler,
        PreviousIntentHandler,
        HelpHandler,
        RepeatHandler,
        ExitHandler,
        SessionEndedRequestHandler
    )
    .addRequestInterceptors(LocalizationInterceptor)
    .addErrorHandlers(ErrorHandler)
    .withApiClient(new Alexa.DefaultApiClient())
    .lambda();
