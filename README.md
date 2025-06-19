**For Localhost env MongoDB and PORTS**
1. For server.js change const PORT to 3000,
2. For .env change PORT to 3000,
3. For docker-compose.yml in "app" change PORT to 3000 
4. Also the mongodb url must be - "mongodb://mongodb:27017/survey_app"

**For Production env MongoDB and PORTS**
1. For server.js PORT numbers must be - 3003
2. For .env - 3002
3. In docker-compose.yml for "app" PORT numbers must be - 3002
4. Also the mongodb url must be - "mongodb://172.31.9.187:27017/survey_app"
