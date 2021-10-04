#!/usr/bin/env node
import CryptoJS from "crypto-js";
import axios from "axios";
import prompt_sync from "prompt-sync";
import clipboardy from "clipboardy";
import ora from "ora";
import chalk from "chalk";
import child_process from "child_process";
import fs from "fs";
import csv_parser from "csv-parser";
import csv_writer from "csv-writer";

// const BASE_URL = "http://127.0.0.1:5000/user/";
const BASE_URL = "https://secure-passwd-manager.herokuapp.com/user/";
let USERNAME, PASSWORD;
const record = [];
const prompt = prompt_sync({ sigint: true });
const spinner = ora();

function get_input_from_editor(previous_text) {
  const temp_folder = /^win/.test(process.platform) ? "%TEMP%\\" : "/tmp/";
  const file = temp_folder + process.pid + ".txt";
  if (previous_text) fs.writeFileSync(file, previous_text);
  const ed = /^win/.test(process.platform) ? "notepad" : "vim";
  const editor = process.env.VISUAL || process.env.EDITOR || ed;
  child_process.spawnSync(editor, [file], { stdio: "inherit" });
  try {
    let new_text = fs.readFileSync(file, { encoding: "utf-8" });
    fs.unlinkSync(file);
    return new_text.replace(/\n+$/, "");
  } catch {
    return "";
  }
}

async function get_records() {
  spinner.start("Fetching records");
  try {
    let response = await axios.get(BASE_URL + USERNAME);
    let data = response.data["records"];
    for (let i = 0; i < data.length; ++i) {
      record.push({
        id: data[i]["id"],
        title: CryptoJS.AES.decrypt(data[i]["title"], PASSWORD).toString(
          CryptoJS.enc.Utf8
        ),
        password: CryptoJS.AES.decrypt(data[i]["password"], PASSWORD).toString(
          CryptoJS.enc.Utf8
        ),
        url: CryptoJS.AES.decrypt(data[i]["url"], PASSWORD).toString(
          CryptoJS.enc.Utf8
        ),
        notes: CryptoJS.AES.decrypt(data[i]["notes"], PASSWORD).toString(
          CryptoJS.enc.Utf8
        ),
      });
    }
    spinner.succeed("Fetched all records.");
  } catch (error) {
    if (error.response && error.response.status === 404) {
      spinner.info("User not found. New user will be created.");
    } else {
      spinner.fail("Something went wrong");
    }
  }
}

async function post_record(title, password, url, notes) {
  spinner.start("Adding");
  let post = {
    title: CryptoJS.AES.encrypt(title, PASSWORD).toString(),
    password: CryptoJS.AES.encrypt(password, PASSWORD).toString(),
    url: CryptoJS.AES.encrypt(url, PASSWORD).toString(),
    notes: CryptoJS.AES.encrypt(notes, PASSWORD).toString(),
  };
  try {
    let response = await axios.post(BASE_URL + USERNAME, post);
    record.push({
      id: response.data["id"],
      title: title,
      password: password,
      url: url,
      notes: notes,
    });
    spinner.succeed("Added successfully");
  } catch (error) {
    spinner.fail("Something went wrong!");
  }
}

async function patch_record(title, password, url, notes, index) {
  spinner.start("Modifying");
  let patch = {
    id: record[index].id,
    title: CryptoJS.AES.encrypt(title, PASSWORD).toString(),
    password: CryptoJS.AES.encrypt(password, PASSWORD).toString(),
    url: CryptoJS.AES.encrypt(url, PASSWORD).toString(),
    notes: CryptoJS.AES.encrypt(notes, PASSWORD).toString(),
  };
  try {
    await axios.patch(BASE_URL + USERNAME, patch);
    record[index] = {
      id: record[index].id,
      title: title,
      password: password,
      url: url,
      notes: notes,
    };
    spinner.succeed("Modified successfully");
  } catch (error) {
    spinner.fail("Something went wrong!");
  }
}

async function delete_record(index) {
  spinner.start("Deleting");
  try {
    await axios.delete(BASE_URL + USERNAME, {
      params: { id: record[index].id },
    });
    record.splice(index, 1);
    spinner.succeed("Deleted successfully");
  } catch (error) {
    spinner.fail("Something went wrong!");
  }
}

function list_records() {
  for (let index = 0; index < record.length; index++) {
    console.log(
      ` [${chalk.magenta(index)}] ${chalk.yellow(record[index].title)}`
    );
  }
}

function show_record(index) {
  console.log(chalk.blue(" Title ") + chalk.green(record[index].title));
  console.log(chalk.blue(" Password ") + chalk.green(record[index].password));
  if (record[index].url)
    console.log(chalk.blue(" Url ") + chalk.green(record[index].url));
  if (record[index].notes)
    console.log(
      chalk.blue(" Notes ") +
        chalk.green(record[index].notes.replace(/\n/g, "\n       "))
    );
}

function copy_record_passwd(index) {
  clipboardy.writeSync(record[index].password);
}

async function import_csv(filename) {
  if (!fs.existsSync(filename)) {
    console.error(chalk.red("✖"), "File does not exist");
    return;
  }
  const stream = fs.createReadStream(filename);
  const parser = stream.pipe(csv_parser());
  for await (const data of parser) {
    await post_record(data.Title, data.Password, data.URL, data.Notes);
  }
  console.log(chalk.green("✔"), "Imported succesfully from " + filename)
}

async function export_csv(filename) {
  spinner.start("Exporting to " + filename);
  try {
    const csv_writer_obj = csv_writer.createObjectCsvWriter({
      path: filename,
      header: [
        { id: "title", title: "Title" },
        { id: "password", title: "Password" },
        { id: "url", title: "URL" },
        { id: "notes", title: "Notes" },
      ],
    });
    await csv_writer_obj.writeRecords(record);
    spinner.succeed("Exported successfully to " + filename);
  } catch (error) {
    spinner.fail("Something went wrong!");
  }
}

USERNAME = prompt(chalk.cyan("Username "));
if (USERNAME.length === 0) {
  console.error(chalk.red("Invalid input!"));
  process.exit();
}
PASSWORD = prompt.hide(chalk.cyan("Master password "));
if (PASSWORD.length === 0) {
  console.error(chalk.red("Invalid input!"));
  process.exit();
}
PASSWORD = CryptoJS.SHA256(PASSWORD).toString(CryptoJS.enc.Hex);
USERNAME = CryptoJS.HmacSHA256(USERNAME, PASSWORD).toString(CryptoJS.enc.Hex);

await get_records();
while (true) {
  let command = prompt("❯ ", {
    autocomplete: (str) => {
      const commands = [
        "ls",
        "new",
        "edit",
        "show",
        "rm",
        "cp",
        "exit",
        "import",
        "export",
      ];
      const res = [];
      for (let i = 0; i < commands.length; i++) {
        if (commands[i].indexOf(str) == 0) res.push(commands[i]);
      }
      return res;
    },
  }).split(" ");
  let title, password, url, notes, choice;
  let index = Number(command[1]);
  switch (command[0]) {
    case "ls":
      list_records();
      break;
    case "new":
      title = prompt(chalk.blue(" Title "));
      if (title.length === 0) {
        console.error(chalk.red("Invalid input!"));
        break;
      }
      password = prompt(chalk.blue(" Password "));
      if (password.length === 0) {
        console.error(chalk.red("Invalid input!"));
        break;
      }
      url = prompt(chalk.blue(" URL "));
      choice = prompt(chalk.grey(" Add Notes (Y/n) "), "y");
      if (choice.toLowerCase() === "y" || choice.toLowerCase() === "yes")
        notes = get_input_from_editor();
      else notes = "";
      await post_record(title, password, url, notes);
      break;
    case "edit":
      if (index + 1 > record.length || index < 0 || isNaN(index)) {
        console.error(chalk.red("Invalid usage!"));
        break;
      }
      title = prompt(
        chalk.blue(" Title (") +
          chalk.gray(record[index].title) +
          chalk.blue(") "),
        record[index].title
      );
      password = prompt(
        chalk.blue(" Password (") +
          chalk.gray(record[index].password) +
          chalk.blue(") "),
        record[index].password
      );
      url = prompt(
        chalk.blue(" URL (") + chalk.gray(record[index].url) + chalk.blue(") "),
        record[index].url
      );
      choice = prompt(chalk.grey(" Add/Modify Notes (Y/n) "), "y");
      if (choice.toLowerCase() === "y" || choice.toLowerCase() === "yes")
        notes = get_input_from_editor(record[index].notes);
      else notes = record[index].notes;
      if (
        title !== record[index].title ||
        password !== record[index].password ||
        url !== record[index].url ||
        notes !== record[index].notes
      ) {
        await patch_record(title, password, url, notes, index);
      }
      break;
    case "show":
      if (index + 1 > record.length || index < 0 || isNaN(index)) {
        console.error(chalk.red("Invalid usage!"));
        break;
      }
      show_record(index);
      break;
    case "rm":
      if (index + 1 > record.length || index < 0 || isNaN(index)) {
        console.error(chalk.red("Invalid usage!"));
        break;
      }
      await delete_record(index);
      break;
    case "cp":
      if (index + 1 > record.length || index < 0 || isNaN(index)) {
        console.error(chalk.red("Invalid usage!"));
        break;
      }
      copy_record_passwd(index);
      break;
    case "import":
      if (command.length < 2) {
        console.error(chalk.red("Invalid usage!"));
        break;
      }
      await import_csv(command[1]);
      break;
    case "export":
      if (command.length < 2) {
        console.error(chalk.red("Invalid usage!"));
        break;
      }
      await export_csv(command[1]);
      break;
    case "exit":
      process.exit();
    case "?":
    case "help":
      console.log(
        " Available commands:\n\
                ls -- list all records\n\
                new -- add a new record\n\
                edit [index] -- edit an existing record at [index]\n\
                show [index] -- show an existing record at [index]\n\
                rm [index] -- remove an existing record at [index]\n\
                cp [index] -- copy password to clipboard of an existing record at [index]\n\
                import [filename] -- import records from csv file\n\
                export [filename] -- export records to csv file\n\
                exit -- exit passman\n\
                ?, help -- print this help message"
      );
      break;
    case "":
      break;
    default:
      console.error(chalk.red("Invalid input"));
      break;
  }
}
