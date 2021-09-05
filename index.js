#!/usr/bin/env node
import CryptoJS from "crypto-js";
import axios from "axios";
import prompt_sync from "prompt-sync";
import clipboardy from "clipboardy";
import ora from "ora";
import chalk from "chalk";
import child_process from "child_process";
import fs from "fs";

// const BASE_URL = "http://127.0.0.1:5000/user/";
const BASE_URL = "https://secure-passwd-manager.herokuapp.com/user/";
let USERNAME, PASSWORD;
const record = [];
const prompt = prompt_sync({ sigint: true });
const spinner = ora();

function get_input_from_editor(previous_text) {
    const file = "/tmp/" + process.pid + ".txt";
    if (previous_text) fs.writeFileSync(file, previous_text);
    const editor = process.env.VISUAL || process.env.EDITOR || ed;
    child_process.spawnSync(editor, [file], { stdio: "inherit" });
    let new_text = fs.readFileSync(file, { encoding: "utf-8" });
    fs.unlinkSync(file);
    return new_text.replace(/\n+$/, "");
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
            const commands = ["ls", "new", "edit", "show", "rm", "cp", "exit"];
            const res = [];
            for (let i = 0; i < commands.length; i++) {
                if (commands[i].indexOf(str) == 0) res.push(commands[i]);
            }
            return res;
        },
    }).split(" ");
    let title, password, url, notes;
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
            notes = get_input_from_editor();
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
            notes = get_input_from_editor(record[index].notes);
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
                exit -- exit passman\n\
                ?, help -- print this help message"
            );
        case "":
            break;
        default:
            console.error(chalk.red("Invalid input"));
            break;
    }
}
