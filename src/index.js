/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/// <reference types="@fastly/js-compute" />

import * as response from './lib/response.js';
import { log } from './lib/log.js';

const FONTERRA_AUTH_ORIGIN = "https://31876-958orangelandfowl.adobeio-static.net";
const FONTERRA_AUTH_PREFIX = "/api/v1/web/fonterra-auth";
const PUBLIC_SITE_ORIGIN = "https://customdemo.run.place";
const EDGE_LOOP_BREAK_HEADER = "x-edgefunction-request";
const AUTH_COOKIE_NAME = "fonterra_auth_token";
const MY_ACCOUNT_PREFIX = "/my-account";
const GLOBAL_MY_ACCOUNT_PREFIX = "/global/en/my-account";

function isFonterraAuthPath(pathname) {
  return pathname === FONTERRA_AUTH_PREFIX || pathname.startsWith(`${FONTERRA_AUTH_PREFIX}/`);
}

function isPathOrChild(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function getCookieValue(cookieHeader, cookieName) {
  if (!cookieHeader) {
    return null;
  }
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const cookie = part.trim();
    if (cookie.startsWith(`${cookieName}=`)) {
      return cookie.slice(cookieName.length + 1);
    }
  }
  return null;
}

function hasAuthCookie(req) {
  const cookieHeader = req.headers.get("cookie");
  const token = getCookieValue(cookieHeader, AUTH_COOKIE_NAME);
  return Boolean(token && token.trim());
}

function buildUnauthorizedRedirect(url) {
  const loginPath = isPathOrChild(url.pathname, GLOBAL_MY_ACCOUNT_PREFIX)
    ? GLOBAL_MY_ACCOUNT_PREFIX
    : MY_ACCOUNT_PREFIX;
  const loginUrl = new URL(loginPath, PUBLIC_SITE_ORIGIN);
  loginUrl.searchParams.set("error", "401");
  return new Response("Access denied", {
    status: 401,
    headers: {
      "location": loginUrl.toString(),
      "refresh": `0; url=${loginUrl.toString()}`,
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8"
    }
  });
}

async function passthroughToOrigin(req) {
  const reqUrl = new URL(req.url);
  const passthroughUrl = new URL(`${reqUrl.pathname}${reqUrl.search}`, PUBLIC_SITE_ORIGIN);
  const passthroughRequest = new Request(passthroughUrl.toString(), req);
  passthroughRequest.headers.set(EDGE_LOOP_BREAK_HEADER, "true");
  return fetch(passthroughRequest);
}

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event) {
  const req = event.request;
  const url = new URL(req.url);

  let finalResponse;

  try {
    // Route matching
    if (isPathOrChild(url.pathname, MY_ACCOUNT_PREFIX) || isPathOrChild(url.pathname, GLOBAL_MY_ACCOUNT_PREFIX)) {
      const isLoginPage = (url.pathname === MY_ACCOUNT_PREFIX || url.pathname === GLOBAL_MY_ACCOUNT_PREFIX);
      if (!isLoginPage && !hasAuthCookie(req)) {
        finalResponse = buildUnauthorizedRedirect(url);
      } else {
        finalResponse = await passthroughToOrigin(req);
      }
    } else if (isFonterraAuthPath(url.pathname)) {
      const upstreamUrl = new URL(`${url.pathname}${url.search}`, FONTERRA_AUTH_ORIGIN);
      const upstreamRequest = new Request(upstreamUrl.toString(), req);
      finalResponse = await fetch(upstreamRequest);
    } else {
      finalResponse = response.notFound();
    }
  } catch (err) {
    console.log(err);
    finalResponse = response.error();
  }

  // Log the request and response
  log(req, finalResponse);

  return finalResponse;
}

