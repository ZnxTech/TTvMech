FROM node:26-alpine

WORKDIR /ttvmech

COPY . .
RUN ["npm", "ci"]
RUN ["npm", "run", "build"]

ENV META_PLUGINS_PATH="/ttvmech/plugins"
ENV META_DB_PATH="/ttvmech/data/db"
ENV META_LOG_PATH="/ttvmech/data/logs"

EXPOSE 31314

CMD ["npm", "start"]