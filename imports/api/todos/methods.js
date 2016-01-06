import { Todos } from './todos.js';
import { Lists } from '../lists/lists.js';
import { ValidatedMethod } from 'mdg:validated-method';
import { SimpleSchema } from 'aldeed:simple-schema';
import { DDPRateLimiter } from 'ddp-rate-limiter';

export const insert = new ValidatedMethod({
  name: 'Todos.methods.insert',
  validate: new SimpleSchema({
    listId: { type: String },
    text: { type: String }
  }).validator(),
  run({ listId, text }) {
    const list = Lists.findOne(listId);

    if (list.isPrivate() && list.userId !== this.userId) {
      throw new Meteor.Error('Todos.methods.insert.unauthorized',
        'Cannot add todos to a private list that is not yours');
    }

    const todo = {
      listId,
      text,
      checked: false,
      createdAt: new Date()
    };

    Todos.insert(todo);
  }
});

export const setCheckedStatus = new ValidatedMethod({
  name: 'Todos.methods.makeChecked',
  validate: new SimpleSchema({
    todoId: { type: String },
    newCheckedStatus: { type: Boolean }
  }).validator(),
  run({ todoId, newCheckedStatus }) {
    const todo = Todos.findOne(todoId);

    if (todo.checked === newCheckedStatus) {
      // The status is already what we want, let's not do any extra work
      return;
    }

    if (!todo.editableBy(this.userId)) {
      throw new Meteor.Error('Todos.methods.setCheckedStatus.unauthorized',
        'Cannot edit checked status in a private list that is not yours');
    }

    Todos.update(todoId, {$set: {
      checked: newCheckedStatus
    }});
  }
});

export const updateText = new ValidatedMethod({
  name: 'Todos.methods.updateText',
  validate: new SimpleSchema({
    todoId: { type: String },
    newText: { type: String }
  }).validator(),
  run({ todoId, newText }) {
    // This is complex auth stuff - perhaps denormalizing a userId onto todos
    // would be correct here?
    const todo = Todos.findOne(todoId);

    if (!todo.editableBy(this.userId)) {
      throw new Meteor.Error('Todos.methods.updateText.unauthorized',
        'Cannot edit todos in a private list that is not yours');
    }

    Todos.update(todoId, {
      $set: { text: newText }
    });
  }
});

export const remove = new ValidatedMethod({
  name: 'Todos.methods.remove',
  validate: new SimpleSchema({
    todoId: { type: String }
  }).validator(),
  run({ todoId }) {
    const todo = Todos.findOne(todoId);

    if (!todo.editableBy(this.userId)) {
      throw new Meteor.Error('Todos.methods.remove.unauthorized',
        'Cannot remove todos in a private list that is not yours');
    }

    Todos.remove(todoId);
  }
});

// Get list of all method names on Todos
const TODOS_METHODS = _.pluck([
  insert,
  setCheckedStatus,
  updateText,
  remove,
], 'name');

if (Meteor.isServer) {
  // Only allow 5 todos operations per connection per second
  DDPRateLimiter.addRule({
    name(name) {
      return _.contains(TODOS_METHODS, name);
    },

    // Rate limit per connection ID
    connectionId() { return true; }
  }, 5, 1000);
}
