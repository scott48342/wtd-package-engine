# services/

Business services:
- auth
- wheels
- tires
- fitment
- packages
- pricing

Each service should:
- accept plain JS inputs
- return plain JS outputs
- throw typed errors

Express routes should be thin wrappers around these services.
