process.env = {
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY: 'oahsd',
    AWS_SECRET_KEY: '12345',
    RATE_LIMIT_WINDOW: '10',
    RATE_LIMIT_CONNECTIONS: '100',
    DYNAMO_ENDPOINT: 'http://localhost:4567',
    ELK_LOGGER_HOST: 'localhost:9200',
    METRICS_HOST: 'ignore.localhost',
    JWT_HEADER: 'JWT',
    JWT_SECRET: 'tests-for-days',
    LOGGING_LEVEL: 'INFO',
    ENVIRONMENT: 'Tests',
    RUN_INTERVAL: 1,
    TEST_RUNNER: true,
    IP_ADDRESS: 8080,
    SQS_WATCHERS: 2,
    MAX_SQS_MESSAGE: 5
};
