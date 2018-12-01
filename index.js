const axios = require("axios");
const dotenv = require("dotenv");
const fs = require("fs");
dotenv.config();

const instance = axios.create({
  baseURL: process.env.PIPELINEDEALS_URI,
  params: {
    api_key: process.env.PIPELINEDEALS_TOKEN
  }
});

async function getAll(type) {
  let page = 1;
  let data = null;
  let entities = [];
  while (!data || data.pagination.page < data.pagination.pages) {
    data = (await instance.get(`/api/v3/${type}.json?page=${page}`)).data;
    page++;

    if (data) {
      data.entries.forEach(entity => {
        entities.push(entity);
      });
    }
  }

  return entities;
}

function toCSV(entities) {
  let header = [];
  entities.forEach(entity => {
    Object.keys(entity).forEach(key => {
      if (header.indexOf(key) === -1) header.push(key);
    });
  });

  entities.forEach(entity => {
    header.forEach(col => {
      if (!entity[col]) {
        entity[col] = null;
      }
    });
  });

  const replacer = (key, value) => {
    if (!value) {
      return null;
    } else if (typeof value === "object") {
      return JSON.stringify(value).replace(/"/g, "'");
    } else if (typeof value === "string") {
      return value.replace(/"/g, "'");
    }

    return value;
  };

  let csv = entities.map(row =>
    header.map(col => JSON.stringify(row[col], replacer)).join(",")
  );

  header.forEach((value, index) => {
    var split = value
      .replace(/_/g, " ")
      .toLowerCase()
      .split(" ");
    for (var i = 0; i < split.length; i++) {
      split[i] = split[i].charAt(0).toUpperCase() + split[i].substring(1);
    }
    header[index] = split.join(" ");
  });

  csv.unshift(header.join(","));
  csv = csv.join("\r\n");
  return csv;
}

const PipelineDealsEntity = {
  COMPANIES: "companies",
  PEOPLE: "people",
  DEALS: "deals",
  COMPANIES_FIELDS: "admin/company_custom_field_labels",
  USERS_FIELDS: "admin/person_custom_field_labels",
  DEALS_FIELDS: "admin/deal_custom_field_labels"
};

(async () => {
  const fieldMap = new Map();
  [
    ...(await getAll(PipelineDealsEntity.COMPANIES_FIELDS)),
    ...(await getAll(PipelineDealsEntity.DEALS_FIELDS)),
    ...(await getAll(PipelineDealsEntity.USERS_FIELDS))
  ].forEach(field => {
    fieldMap.set(field.id.toString(), field);
  });

  // Columns to exclude on CSV.
  const exclude = [];
  function filter(entities) {
    entities.forEach(entity => {
      if (entity.custom_fields) {
        Object.entries(entity.custom_fields).forEach(([key, value]) => {
          const field = fieldMap.get(key.split("_")[2]);
          entity[field.name] = value;
        });
        delete entity.custom_fields;
      }

      for (let [key, value] of Object.entries(entity)) {
        if (exclude.indexOf(key) !== -1) {
          delete entity[key];
        }
      }
    });
  }

  const companies = await getAll(PipelineDealsEntity.COMPANIES);
  const users = await getAll(PipelineDealsEntity.PEOPLE);
  const deals = await getAll(PipelineDealsEntity.DEALS);

  [companies, users, deals].forEach(entities => filter(entities));

  fs.writeFileSync(__dirname + "/companies.csv", toCSV(companies));
  fs.writeFileSync(__dirname + "/people.csv", toCSV(users));
  fs.writeFileSync(__dirname + "/deals.csv", toCSV(deals));
})();
