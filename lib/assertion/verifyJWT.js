"use strict";

const debug = require("debug")("jwt-assertion:assertion:verifyJWT");
const { InvalidRequestError } = require("oidc-provider/lib/helpers/errors");

const epochTime = (date = Date.now()) => Math.floor(date / 1000);

function decode(jwt) {
    const parts = String(jwt).split(".");

    return {
        header: JSON.parse(decode(parts[0])),
        payload: JSON.parse(decode(parts[1])),
    };
}

module.exports = async function verifyJWT(ctx, next) {
    debug("verify assertion jwt");
    const jwt = ctx.oidc.assertion_grant.payload;

    let decoded;

    debug("jwt %O", jwt);
        // debug(jwt.split(".").length);

    if (jwt.split(".").length === 3) {
            // case 1: compact serialization
        debug("assertion payload in compact serialization");
        try {
            decoded = await decode(jwt);
        }
        catch (error) {
            debug("assertion payload is an invalid compact serialization");
            ctx.throw(new InvalidRequestError("invalid assertion provided"));
        }

        debug("decoded %O", decoded);
    }
    else {
        try {
                decoded = JSON.parse(jwt); // eslint-disable-line
        }
        catch (error) {
            debug("assertion payload is not in JSON serialization");
            ctx.throw(new InvalidRequestError("invalid assertion provided"));
        }

        debug("assertion payload in JSON serialization");
    }

    if (!(decoded.payload &&
            decoded.header &&
            decoded.header.kid &&
            decoded.payload.iss &&
            decoded.payload.aud &&
            decoded.payload.sub)) {

        debug("mandatory assertion claims are missings");
            // TODO find out missing claims
        ctx.throw(new InvalidRequestError("invalid assertion provided"));
    }

        // if (decoded.payload.azp) {
        //     debug("Requirement 3.1.10");
        //     if (decoded.payload.azp !== decoded.payload.iss) {
        //         debug("requirement 3.1.11 verify that client has proxy_authorization");
        //         // TODO Verify if the issuer or its client is registered for proxy_authorization.
        //     }
        // }
        // else {
        //     // the azp is the issuer.
        //     // this case is required for authorizing a client to access a different client.
        //     // TODO how is this supposed to be handled?
        //     // IDEA 1. use offline tokens for authenticating a sub.
        //     // IDEA 2. use a sub cnf key to authorize a sub
        // }

        // Timestamp validation for iat, nbf, and exp
    const now = epochTime();
    const old = now - 1800; // 30 min is max, should be configurable

        // NOTE Some clients have clock problems. normally this should not be a
        // problem. In case it is, we may want to allow a little variance.
    debug(`now (${now}) vs. old (${old})`);

    if (decoded.payload.iat) {
        if (isNaN(decoded.payload.iat) ||
                decoded.payload.iat <= 0) {
            debug("invalid iat claim");
            ctx.throw(new InvalidRequestError("invalid assertion provided"));
        }

            // debug(`iat claim ${parseInt(decoded.payload.iat)}`);
            // debug(`now timestamp ${now - parseInt(decoded.payload.iat)}`);
        if (parseInt(decoded.payload.iat) > now) {
            debug(`premature iat claim ${decoded.payload.iat} is ${now - parseInt(decoded.payload.iat)} sec off `);
            ctx.throw(new InvalidRequestError("invalid assertion provided"));
        }

        if (!decoded.payload.exp &&
                parseInt(decoded.payload.iat) < old) {
            debug("outdated iat claim");
            ctx.throw(new InvalidRequestError("invalid assertion provided"));
        }
    }

    if (decoded.payload.nbf) {
        if (isNaN(decoded.payload.nbf) ||
                decoded.payload.nbf <= 0) {
            debug("invalid nbf claim");
            ctx.throw(new InvalidRequestError("invalid assertion provided"));
        }

        if (parseInt(decoded.payload.nbf) >= now) {
            debug(`premature iat claim ${decoded.payload.nbf} is ${now - parseInt(decoded.payload.nbf)} sec off `);

            ctx.throw(new InvalidRequestError("invalid assertion provided"));
        }

        if (!decoded.payload.exp &&
                parseInt(decoded.payload.nbf) >= old) {
            debug("outdated nbf claim");
            ctx.throw(new InvalidRequestError("invalid assertion provided"));
        }
    }

    if (decoded.payload.exp) {
        if (isNaN(decoded.payload.exp) ||
                decoded.payload.exp <= 0) {
            debug("invalid exp claim");
            ctx.throw(new InvalidRequestError("invalid assertion provided"));
        }

        if (decoded.payload.exp < now) {
            debug("expired exp claim");
            ctx.throw(new InvalidRequestError("invalid assertion provided"));
        }
    }

        // TODO verify aud points to the token endpoint

    ctx.oidc.assertion_grant.jwt = jwt;
    ctx.oidc.assertion_grant.payload = decoded;
    ctx.oidc.assertion_grant.body = decoded.payload;

    await next();
};
