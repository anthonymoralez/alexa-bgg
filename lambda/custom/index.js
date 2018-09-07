/* jshint esversion: 6 */
/* jshint laxbreak: true */
/* jshint node: true */
/* eslint ecmaVersion: 2017 */
// vim: ts=4 sw=4 expandtab

"use strict";
const Alexa = require('ask-sdk');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
const bgg = require('./bgg');

const ShowBoardGameIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'Display.ElementSelected'
            || (handlerInput.requestEnvelope.request.type === 'IntentRequest'
                && handlerInput.requestEnvelope.request.intent.name === 'ShowBoardGameIntent');
    },
    async handle(handlerInput) {
        console.log("show board game intent");
        const request = handlerInput.requestEnvelope.request;
        const currentIntent = request.intent;
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        sessionAttributes.speakOutput = "";

        let id;
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
                    await loadItems(sessionAttributes);
                    console.log("loaded games");
                }

                const rank = parseInt(name,10);
                id = sessionAttributes.items[rank - 1].id;
            } else {
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
                console.log(`searching bgg for ${name}`);
                const results = await bgg.search(name);
                console.log(results);
                id = getFirstOrOnly(results).id;
            }
        } else {
            sessionAttributes.speakOutput = "I'm sorry. I think you were asking me to tell you about a board game, but I didn't catch the name or number of the game.";
            sessionAttributes.repromptSpeech = ` You can say describe ${sessionAttributes.items[0].name.value}. Or you can say describe three, and I will describe the third game in the hot list. You can always say exit`;
            sessionAttributes.speakOutput += sessionAttributes.repromptSpeech;
            return handlerInput.responseBuilder
                .speak(sessionAttributes.speakOutput)
                .reprompt(sessionAttributes.repromptSpeech)
                .withShouldEndSession(false)
                .getResponse();
        }

        const game = await bgg.loadGame(id);
        console.log(JSON.stringify(game));
        sessionAttributes.game = game;
        sessionAttributes.speakOutput += describeCategoryAndMechanics(game);

        if (supportsDisplay(handlerInput)) {
            console.log("displaying body template");
            const body3 = bodyTemplate3(game, handlerInput.responseBuilder, sessionAttributes);
            console.log(JSON.stringify(body3));
            return body3;
        } else {
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
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest'
            || (handlerInput.requestEnvelope.request.type === 'IntentRequest'
                && handlerInput.requestEnvelope.request.intent.name === 'BGGHotIntent');
    },
    async handle(handlerInput) {
        console.log("handling HotIntent");
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

        await loadItems(sessionAttributes);
        sessionAttributes.items.forEach(function(i) {
          sessionAttributes.listOutput += `${getRandomElement(requestAttributes.t('NEXT_ITEM_MESSAGES')[i.rank-1])} ${i.name.value}. `;
        });
        sessionAttributes.speakOutput += sessionAttributes.listOutput
        console.log(sessionAttributes.speakOutput);

        if (supportsDisplay(handlerInput)) {
            console.log("displaying list2 template");
            const list2 = listTemplateMaker('ListTemplate2', handlerInput, sessionAttributes.items, `Board Game Geek Top ${sessionAttributes.pageSize} Boardgames`, sessionAttributes.speakOutput);
            console.log(JSON.stringify(list2));
            return list2;
        } else {
            return handlerInput.responseBuilder
                .speak(sessionAttributes.speakOutput)
                .reprompt(sessionAttributes.repromptSpeech)
                .withShouldEndSession(true)
                .getResponse();
        }
    },
};

const PreviousIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.PreviousIntent';
    },
    handle(handlerInput) {
        console.log("handling previous intent");
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        console.log(JSON.stringify(attributes));

        //If we are showing a game and can go back to the main list then go back to the list.
        if (supportsDisplay(handlerInput) && attributes.game && attributes.items) {
            console.log("displaying main list");
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
            HELP_MESSAGE: 'Right now I can only list the top hot boardgames from board game geek. Just ask what are the top boardgames. Check back soon because I\'m learning more every month.',
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


async function loadItems(sessionAttributes) {
    try {
        const items = await bgg.getHotList();
        sessionAttributes.items = items.slice(0, sessionAttributes.pageSize);
    } catch(error){
        console.log(error);
        throw error;
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

function bodyTemplate3(game, response, sessionAttributes) {
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

    if (sessionAttributes.speakOutput) {
        response.speak(sessionAttributes.speakOutput);
    }

    return response
        .addRenderTemplateDirective(bodyTemplateDirective)
        .getResponse();
}

function getBoxStats(game) {
    return `👨‍👩‍👧‍👦 ${game.minplayers.value} to ${game.maxplayers.value}.\n⏰ ${game.playingtime.value} minutes.`
}

function describeCategoryAndMechanics(game) {
    let response = getFirstOrOnly(game.name).value;

    const designers = game.link
        .filter(function(l) {
            return l.type === 'boardgamedesigner' && l.id !== '3';
        })
        .map(function(l) { return l.value; });
    if (designers.length !== 0) {
        response += `, by ${designers.join(", ")}`;
    }

    const artists = game.link
        .filter(function(l) {
            return l.type === 'boardgameartist' && l.id !== '3';
        })
        .map(function(l) { return l.value; });
    if (artists.length !== 0) {
        response += `, with art by ${artists.join(", ")}`;
    }

    let sayGame=' game';
    const categories = game.link
        .filter(function(l) {
            return l.type === 'boardgamecategory';
        })
        .map(function(l) {
            if (l.value.toLowerCase().includes('game')) {
                sayGame = '';
            }
            return l.value;
        });
    if (categories.length !== 0) {
        response += `, is ${chooseArticle(categories[0])} ${categories.join(", ")}${sayGame}`;
    }

    const mechanics = game.link
        .filter(function(l) {
            return l.type === 'boardgamemechanic';
        })
        .map(function(l) { return l.value; });
    if (mechanics.length !== 0) {
        response += ` using the following mechanics: ${mechanics.join(", ")}.`;
    }

    return response
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

function getFirstOrOnly(maybeArray) {
    if (Array.isArray(maybeArray)) {
        return array[0];
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
    .lambda();
