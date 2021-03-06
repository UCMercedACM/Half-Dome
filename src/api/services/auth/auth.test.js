/* eslint-disable arrow-body-style */
const request = require("supertest");
const httpStatus = require("http-status");
const { expect } = require("chai");
const sinon = require("sinon");

const app = require("../../index");
const { Member } = require("../member/member.model");
const RefreshToken = require("./refreshToken.model");
const authProviders = require("../../utils/authProviders");

const sandbox = sinon.createSandbox();

const fakeOAuthRequest = () =>
  Promise.resolve({
    service: "facebook",
    id: "123",
    name: "member",
    email: "test@test.com",
    picture: "test.jpg",
  });

describe("Authentication API", () => {
  let dbMember;
  let member;
  let refreshToken;

  beforeEach(async () => {
    dbMember = {
      email: "branstark@gmail.com",
      password: "mypassword",
      name: "Bran Stark",
      role: "admin",
    };

    member = {
      email: "sousa.dfs@gmail.com",
      password: "123456",
      name: "Daniel Sousa",
    };

    refreshToken = {
      token:
        "5947397b323ae82d8c3a333b.c69d0435e62c9f4953af912442a3d064e20291f0d228c0552ed4be473e7d191ba40b18c2c47e8b9d",
      userId: "5947397b323ae82d8c3a333b",
      userEmail: dbMember.email,
      expires: new Date(),
    };

    await Member.remove({});
    await Member.create(dbMember);
    await RefreshToken.remove({});
  });

  afterEach(() => sandbox.restore());

  describe("POST /v1/auth/register", () => {
    it("should register a new member when request is ok", () => {
      return request(app)
        .post("/v1/auth/register")
        .send(member)
        .expect(httpStatus.CREATED)
        .then((res) => {
          delete member.password;
          expect(res.body.token).to.have.a.property("accessToken");
          expect(res.body.token).to.have.a.property("refreshToken");
          expect(res.body.token).to.have.a.property("expiresIn");
          expect(res.body.member).to.include(member);
        });
    });

    it("should report error when email already exists", () => {
      return request(app)
        .post("/v1/auth/register")
        .send(dbMember)
        .expect(httpStatus.CONFLICT)
        .then((res) => {
          const { field } = res.body.errors[0];
          const { location } = res.body.errors[0];
          const { messages } = res.body.errors[0];
          expect(field).to.be.equal("email");
          expect(location).to.be.equal("body");
          expect(messages).to.include('"email" already exists');
        });
    });

    it("should report error when the email provided is not valid", () => {
      member.email = "this_is_not_an_email";
      return request(app)
        .post("/v1/auth/register")
        .send(member)
        .expect(httpStatus.BAD_REQUEST)
        .then((res) => {
          const { field } = res.body.errors[0];
          const { location } = res.body.errors[0];
          const { messages } = res.body.errors[0];
          expect(field).to.be.equal("email");
          expect(location).to.be.equal("body");
          expect(messages).to.include('"email" must be a valid email');
        });
    });

    it("should report error when email and password are not provided", () => {
      return request(app)
        .post("/v1/auth/register")
        .send({})
        .expect(httpStatus.BAD_REQUEST)
        .then((res) => {
          const { field } = res.body.errors[0];
          const { location } = res.body.errors[0];
          const { messages } = res.body.errors[0];
          expect(field).to.be.equal("email");
          expect(location).to.be.equal("body");
          expect(messages).to.include('"email" is required');
        });
    });
  });

  describe("POST /v1/auth/login", () => {
    it("should return an accessToken and a refreshToken when email and password matches", () => {
      return request(app)
        .post("/v1/auth/login")
        .send(dbMember)
        .expect(httpStatus.OK)
        .then((res) => {
          delete dbMember.password;
          expect(res.body.token).to.have.a.property("accessToken");
          expect(res.body.token).to.have.a.property("refreshToken");
          expect(res.body.token).to.have.a.property("expiresIn");
          expect(res.body.member).to.include(dbMember);
        });
    });

    it("should report error when email and password are not provided", () => {
      return request(app)
        .post("/v1/auth/login")
        .send({})
        .expect(httpStatus.BAD_REQUEST)
        .then((res) => {
          const { field } = res.body.errors[0];
          const { location } = res.body.errors[0];
          const { messages } = res.body.errors[0];
          expect(field).to.be.equal("email");
          expect(location).to.be.equal("body");
          expect(messages).to.include('"email" is required');
        });
    });

    it("should report error when the email provided is not valid", () => {
      member.email = "this_is_not_an_email";
      return request(app)
        .post("/v1/auth/login")
        .send(member)
        .expect(httpStatus.BAD_REQUEST)
        .then((res) => {
          const { field } = res.body.errors[0];
          const { location } = res.body.errors[0];
          const { messages } = res.body.errors[0];
          expect(field).to.be.equal("email");
          expect(location).to.be.equal("body");
          expect(messages).to.include('"email" must be a valid email');
        });
    });

    it("should report error when email and password don't match", () => {
      dbMember.password = "xxx";
      return request(app)
        .post("/v1/auth/login")
        .send(dbMember)
        .expect(httpStatus.UNAUTHORIZED)
        .then((res) => {
          const { code } = res.body;
          const { message } = res.body;
          expect(code).to.be.equal(401);
          expect(message).to.be.equal("Incorrect email or password");
        });
    });
  });

  describe("POST /v1/auth/facebook", () => {
    it("should create a new member and return an accessToken when member does not exist", () => {
      sandbox.stub(authProviders, "facebook").callsFake(fakeOAuthRequest);
      return request(app)
        .post("/v1/auth/facebook")
        .send({ access_token: "123" })
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.token).to.have.a.property("accessToken");
          expect(res.body.token).to.have.a.property("refreshToken");
          expect(res.body.token).to.have.a.property("expiresIn");
          expect(res.body.member).to.be.an("object");
        });
    });

    it("should return an accessToken when member already exists", async () => {
      dbMember.email = "test@test.com";
      await Member.create(dbMember);
      sandbox.stub(authProviders, "facebook").callsFake(fakeOAuthRequest);
      return request(app)
        .post("/v1/auth/facebook")
        .send({ access_token: "123" })
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.token).to.have.a.property("accessToken");
          expect(res.body.token).to.have.a.property("refreshToken");
          expect(res.body.token).to.have.a.property("expiresIn");
          expect(res.body.member).to.be.an("object");
        });
    });

    it("should return error when access_token is not provided", async () => {
      return request(app)
        .post("/v1/auth/facebook")
        .expect(httpStatus.BAD_REQUEST)
        .then((res) => {
          const { field } = res.body.errors[0];
          const { location } = res.body.errors[0];
          const { messages } = res.body.errors[0];
          expect(field).to.be.equal("access_token");
          expect(location).to.be.equal("body");
          expect(messages).to.include('"access_token" is required');
        });
    });
  });

  describe("POST /v1/auth/google", () => {
    it("should create a new member and return an accessToken when member does not exist", () => {
      sandbox.stub(authProviders, "google").callsFake(fakeOAuthRequest);
      return request(app)
        .post("/v1/auth/google")
        .send({ access_token: "123" })
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.token).to.have.a.property("accessToken");
          expect(res.body.token).to.have.a.property("refreshToken");
          expect(res.body.token).to.have.a.property("expiresIn");
          expect(res.body.member).to.be.an("object");
        });
    });

    it("should return an accessToken when member already exists", async () => {
      dbMember.email = "test@test.com";
      await Member.create(dbMember);
      sandbox.stub(authProviders, "google").callsFake(fakeOAuthRequest);
      return request(app)
        .post("/v1/auth/google")
        .send({ access_token: "123" })
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.token).to.have.a.property("accessToken");
          expect(res.body.token).to.have.a.property("refreshToken");
          expect(res.body.token).to.have.a.property("expiresIn");
          expect(res.body.member).to.be.an("object");
        });
    });

    it("should return error when access_token is not provided", async () => {
      return request(app)
        .post("/v1/auth/google")
        .expect(httpStatus.BAD_REQUEST)
        .then((res) => {
          const { field } = res.body.errors[0];
          const { location } = res.body.errors[0];
          const { messages } = res.body.errors[0];
          expect(field).to.be.equal("access_token");
          expect(location).to.be.equal("body");
          expect(messages).to.include('"access_token" is required');
        });
    });
  });

  describe("POST /v1/auth/refresh-token", () => {
    it("should return a new accessToken when refreshToken and email match", async () => {
      await RefreshToken.create(refreshToken);
      return request(app)
        .post("/v1/auth/refresh-token")
        .send({ email: dbMember.email, refreshToken: refreshToken.token })
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.have.a.property("accessToken");
          expect(res.body).to.have.a.property("refreshToken");
          expect(res.body).to.have.a.property("expiresIn");
        });
    });

    it("should report error when email and refreshToken don't match", async () => {
      await RefreshToken.create(refreshToken);
      return request(app)
        .post("/v1/auth/refresh-token")
        .send({ email: member.email, refreshToken: refreshToken.token })
        .expect(httpStatus.UNAUTHORIZED)
        .then((res) => {
          const { code } = res.body;
          const { message } = res.body;
          expect(code).to.be.equal(401);
          expect(message).to.be.equal("Incorrect email or refreshToken");
        });
    });

    it("should report error when email and refreshToken are not provided", () => {
      return request(app)
        .post("/v1/auth/refresh-token")
        .send({})
        .expect(httpStatus.BAD_REQUEST)
        .then((res) => {
          const field1 = res.body.errors[0].field;
          const location1 = res.body.errors[0].location;
          const messages1 = res.body.errors[0].messages;
          const field2 = res.body.errors[1].field;
          const location2 = res.body.errors[1].location;
          const messages2 = res.body.errors[1].messages;
          expect(field1).to.be.equal("email");
          expect(location1).to.be.equal("body");
          expect(messages1).to.include('"email" is required');
          expect(field2).to.be.equal("refreshToken");
          expect(location2).to.be.equal("body");
          expect(messages2).to.include('"refreshToken" is required');
        });
    });
  });
});
