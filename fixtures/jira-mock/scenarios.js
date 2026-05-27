module.exports = {
  happy: {
    kind: 'success',
    body: { id: '10001', key: 'BOT-1500', self: 'http://localhost:4111/rest/api/3/issue/10001' }
  },
  '4xx-auth': {
    kind: 'error',
    status: 401,
    body: { errorMessages: ['Unauthorized'], errors: {} }
  },
  '4xx-project-not-found': {
    kind: 'error',
    status: 404,
    body: { errorMessages: ['Project not found'], errors: {} }
  },
  '5xx-then-success': {
    kind: 'flake',
    status: 503,
    body: { errorMessages: ['Temporary failure'] },
    failTimes: 2,
    successBody: { id: '10002', key: 'BOT-1501', self: 'http://localhost:4111/rest/api/3/issue/10002' }
  },
  '5xx-permanent': {
    kind: 'error',
    status: 503,
    body: { errorMessages: ['Service unavailable'] }
  }
};
